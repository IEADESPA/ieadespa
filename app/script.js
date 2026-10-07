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
  const projetos = await jsonDaTela(res, container, "lista");
  if (projetos === null) return;
  if (!Array.isArray(projetos) || projetos.length === 0) {
    container.innerHTML = "<p class='subtitle'>Nenhum projeto protocolado ainda.</p>";
    return;
  }
  let html = "";
  projetos.forEach(p => {
    const pareceresHtml = (p.pareceres || []).map(par => {
      const rotulo = par.parecer ? `${par.parecer === "FAVORAVEL" ? "✅" : "❌"} ${escaparHtmlEbd(par.parecer)} (${escaparHtmlEbd(par.dataEmissao)})` : "⏳ pendente";
      const botoes = !par.parecer ? `
        <button class="btn-link" data-on-click="emitirParecerAcao" data-args-click="${argsAttr(p.projetoId, String(par.sigla ?? ""), "FAVORAVEL")}">Favorável</button>
        <button class="btn-link btn-link-perigo" data-on-click="emitirParecerAcao" data-args-click="${argsAttr(p.projetoId, String(par.sigla ?? ""), "CONTRARIO")}">Contrário</button>` : "";
      return `<li>${escaparHtmlEbd(par.sigla)}: ${rotulo} ${botoes}</li>`;
    }).join("");
    html += `<div class="cartao-perfil" style="margin-bottom:12px;">
      <h4 style="margin:0 0 6px; color: var(--cor-primaria);">${escaparHtmlEbd(p.protocolo)} — ${escaparHtmlEbd(p.titulo)}</h4>
      <p class="subtitle">Autor: ${escaparHtmlEbd(p.autorNome)} · Protocolado em ${escaparHtmlEbd(p.dataProtocolo)} · Status: ${ROTULO_STATUS_PROJETO[p.status] || escaparHtmlEbd(p.status)}${p.regimeUrgencia ? " (regime de urgência)" : ""}</p>
      <p>${escaparHtmlEbd(p.texto)}</p>
      <ul>${pareceresHtml}</ul>
      ${p.prazoVencido ? `<p class="subtitle" style="color:var(--cor-perigo,#c0392b);">⚠️ Prazo de 15 dias do parecer vencido (${escaparHtmlEbd(p.diasDesdeProtocolo)} dias desde o protocolo).</p>` : ""}
      ${authGeral && p.status === "EM_PARECER" && !p.regimeUrgencia ? `<button class="btn-link" data-on-click="marcarUrgenciaAcao" data-args-click="${argsAttr(p.projetoId)}">Marcar regime de urgência</button>` : ""}
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
  const assentos = await jsonDaTela(res, container, "lista");
  if (assentos === null) return;

  let html = `<table class="tabela-frequencia"><thead><tr>
    <th>Cargo</th><th>Matrícula</th><th>Nome</th><th>Desde</th><th>Até</th><th>Situação</th><th></th>
  </tr></thead><tbody>`;
  Object.entries(CARGOS_DIRETORIA).forEach(([sigla, rotulo]) => {
    const a = Array.isArray(assentos) ? assentos.find(x => x.cargoOuFuncao === sigla) : null;
    html += `<tr>
      <td>${rotulo}</td>
      <td>${a ? a.membroId : "-"}</td>
      <td>${a ? escaparHtmlEbd(a.nome) : "<span class='subtitle'>vago</span>"}</td>
      <td>${a ? escaparHtmlEbd(a.dataInicio) : "-"}</td>
      <td>${a ? (escaparHtmlEbd(a.dataTerminoPrevisao) || "sem prazo") : "-"}</td>
      <td>${a ? badgeSituacaoAssento(a.situacaoEfetiva) : "-"}</td>
      <td>${a && authGeral ? `<button class="btn-link btn-link-perigo" data-on-click="encerrarAssentoDiretoriaAcao" data-args-click="${argsAttr(a.assentoId)}">Encerrar</button>` : ""}</td>
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
  const s = await jsonDaTela(res, container, "objeto");
  if (s === null) return;
  if (!s.sucesso) { container.textContent = s.mensagem || ""; return; }

  if (!s.vago) {
    container.innerHTML = `<p>✅ Presidente em exercício: <strong>${escaparHtmlEbd(s.presidente.nome)}</strong> (matrícula ${s.presidente.membroId}).</p>`;
    return;
  }

  const origem = s.interino ? (s.interino.viaCEI ? "via CEI (Art. 32, nenhum Vice-Presidente ativo)" : "próximo na linha sucessória") : "ninguém disponível (nem Vice-Presidente, nem CEI)";
  let html = `<p>⚠️ Presidência vaga desde <strong>${escaparHtmlEbd(s.dataVacancia)}</strong> (${escaparHtmlEbd(s.diasDesdeVacancia)} dia(s)).</p>`;
  html += `<p>Interino: <strong>${s.interino ? escaparHtmlEbd(s.interino.nome) : "-"}</strong> — ${origem}.</p>`;
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
  const assentos = await jsonDaTela(res, container, "lista");
  if (assentos === null) return;

  let html = `<table class="tabela-frequencia"><thead><tr>
    <th>Cargo</th><th>Matrícula</th><th>Nome</th><th>Desde</th><th>Até</th><th>Situação</th><th></th>
  </tr></thead><tbody>`;
  Object.entries(CARGOS_CONSELHO_FISCAL).forEach(([sigla, rotulo]) => {
    const a = Array.isArray(assentos) ? assentos.find(x => x.cargoOuFuncao === sigla) : null;
    html += `<tr>
      <td>${rotulo}</td>
      <td>${a ? a.membroId : "-"}</td>
      <td>${a ? escaparHtmlEbd(a.nome) : "<span class='subtitle'>vago</span>"}</td>
      <td>${a ? escaparHtmlEbd(a.dataInicio) : "-"}</td>
      <td>${a ? (escaparHtmlEbd(a.dataTerminoPrevisao) || "sem prazo") : "-"}</td>
      <td>${a ? badgeSituacaoAssento(a.situacaoEfetiva) : "-"}</td>
      <td>${a && authGeral ? `<button class="btn-link btn-link-perigo" data-on-click="encerrarAssentoConselhoFiscalAcao" data-args-click="${argsAttr(a.assentoId)}">Encerrar</button>` : ""}</td>
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
  const assentos = await jsonDaTela(res, container, "lista");
  if (assentos === null) return;

  let html = `<table class="tabela-frequencia"><thead><tr>
    <th>Cargo</th><th>Matrícula</th><th>Nome</th><th>Desde</th><th>Até</th><th>Situação</th><th></th>
  </tr></thead><tbody>`;
  Object.entries(CARGOS_CEI).forEach(([sigla, rotulo]) => {
    const a = Array.isArray(assentos) ? assentos.find(x => x.cargoOuFuncao === sigla) : null;
    html += `<tr>
      <td>${rotulo}</td>
      <td>${a ? a.membroId : "-"}</td>
      <td>${a ? escaparHtmlEbd(a.nome) : "<span class='subtitle'>vago</span>"}</td>
      <td>${a ? escaparHtmlEbd(a.dataInicio) : "-"}</td>
      <td>${a ? (escaparHtmlEbd(a.dataTerminoPrevisao) || "sem prazo") : "-"}</td>
      <td>${a ? badgeSituacaoAssento(a.situacaoEfetiva) : "-"}</td>
      <td>${a && authGeral ? `<button class="btn-link btn-link-perigo" data-on-click="encerrarAssentoCEIAcao" data-args-click="${argsAttr(a.assentoId)}">Encerrar</button>` : ""}</td>
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
  const data = await jsonDaTela(res, msg, "objeto");
  if (data === null) return;
  if (!data.sucesso) { msg.textContent = data.mensagem || "Não foi possível checar."; return; }
  const itens = [
    data.cargoElegivel ? "✅ Cargo ministerial (Oficial Superior ou Presbítero 5+ anos)" : `⚠️ ${data.motivoCargo}`,
    data.formacaoVerificavelOk ? "✅ Formação teológica avançada (AFM + CHM)" : `⚠️ ${data.motivoFormacao}`,
    data.reputacaoIlibada ? "✅ Reputação ilibada (sem sanção/exclusão nos últimos 10 anos)" : `⚠️ ${data.motivoReputacao}`
  ];
  msg.innerHTML = itens.map(i => `<div>${escaparHtmlEbd(i)}</div>`).join("");
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
  const medidas = await jsonDaTela(res, container, "lista");
  if (medidas === null) return;
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
      ? `Concluído em ${escaparHtmlEbd(m.dataConclusaoRelatorio)}`
      : (m.prazoRelatorioVencido ? `🔴 VENCIDO (${escaparHtmlEbd(m.diasDesdeAplicacao)} dias)` : `🟡 em curso (${escaparHtmlEbd(m.diasDesdeAplicacao)}/${escaparHtmlEbd(m.diasPrazoRelatorio)} dias)`);
    html += `<tr>
      <td>${m.membroId}</td>
      <td>${escaparHtmlEbd(m.nome)}</td>
      <td>${escaparHtmlEbd(m.motivo)}</td>
      <td>${restricoes}</td>
      <td>${escaparHtmlEbd(m.dataAplicacao)}</td>
      <td>${relatorio}</td>
      <td>${authGeral && !m.dataConclusaoRelatorio ? `<button class="btn-link" data-on-click="concluirRelatorioCautelarAcao" data-args-click="${argsAttr(m.medidaId)}">Concluir relatório</button>` : ""}</td>
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
  const convocacoes = await jsonDaTela(res, container, "lista");
  if (convocacoes === null) return;
  window._convocacoesPendentesCache = convocacoes;
  if (!Array.isArray(convocacoes) || convocacoes.length === 0) {
    container.innerHTML = "<p class='subtitle'>Nenhuma convocação pendente.</p>";
    return;
  }
  container.innerHTML = convocacoes.map(c => {
    const podeIniciar = c.diasParaPrevista <= 0;
    const contagem = c.diasParaPrevista > 0 ? `faltam ${escaparHtmlEbd(c.diasParaPrevista)} dia(s)` : (c.diasParaPrevista === 0 ? "é hoje" : "data já passou");
    const materiasRotulo = (c.materias || "").split(",").filter(Boolean)
      .map(cod => (ROTULOS_MATERIAS[cod] || cod)).join("; ");
    return `<div class="cartao-convocacao" style="border:1px solid #e5e5e5;border-radius:8px;padding:10px;margin-bottom:8px;">
      <strong>${TITULOS_TIPO_SESSAO[c.tipoSessao] || escaparHtmlEbd(c.tipoSessao)}</strong> — prevista para ${escaparHtmlEbd(c.dataPrevista)} (${contagem})<br/>
      <span class="subtitle">Matérias: ${escaparHtmlEbd(materiasRotulo)}${c.reformaNucleoFundamental ? " (Núcleo Fundamental)" : ""}</span><br/>
      <span class="subtitle">Pauta: ${escaparHtmlEbd(c.pauta)}</span><br/>
      <button class="btn-confirmar" style="width:auto;margin-top:6px;" ${podeIniciar ? "" : "disabled"} data-on-click="iniciarSessaoConvocadaAcao" data-args-click="${argsAttr(c.sessaoId)}">▶️ Iniciar Sessão</button>
      ${authGeral ? `<button class="btn-link" style="margin-left:10px;" data-on-click="editarConvocacaoAcao" data-args-click="${argsAttr(c.sessaoId)}">✏️ Editar</button>
      <button class="btn-link btn-link-perigo" data-on-click="excluirConvocacaoAcao" data-args-click="${argsAttr(c.sessaoId)}">🗑️ Cancelar</button>` : ""}
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

// vB.6 — minuta de ata (.docx): presença/quórum/enquetes já calculados,
// pro Secretário partir dela em vez de redigitar tudo no Word.
async function baixarMinutaAta(sessaoId) {
  const res = await fetchProtegido(`${API_BASE}/reunioes/${sessaoId}/minuta`);
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    mostrarToast((data && data.mensagem) || "Não foi possível gerar a minuta.", "erro");
    return;
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `minuta-sessao-${sessaoId}.docx`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
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
  const reunioes = await jsonDaTela(res, container, "objeto");
  if (reunioes === null) return;

  if (reunioes.length === 0) {
    container.innerHTML = "<p class='subtitle'>Nenhuma reunião ainda.</p>";
    return;
  }

  let html = `<table class="tabela-frequencia"><thead><tr>
    <th>Órgão</th><th>Descrição</th><th>Data</th><th>Status</th><th>Presentes</th><th>Faltas</th><th>Justificadas</th><th></th>
  </tr></thead><tbody>`;

  reunioes.forEach(r => {
    html += `<tr>
      <td>${escaparHtmlEbd(r.orgaoNome) || "-"}</td>
      <td>${escaparHtmlEbd(r.descricao)}</td>
      <td>${escaparHtmlEbd(r.dataSessao)}</td>
      <td>${escaparHtmlEbd(r.status)}</td>
      <td>${escaparHtmlEbd(r.totalPresentes)}</td>
      <td>${escaparHtmlEbd(r.totalFaltas)}</td>
      <td>${escaparHtmlEbd(r.totalJustificadas)}</td>
      <td>
        <button class="btn-link" data-on-click="verFrequencia" data-args-click="${argsAttr(r.sessaoId, String(r.descricao ?? ""))}">Ver frequência</button>
        ${r.status === "ABERTA" ? `<button class="btn-link" data-on-click="encerrarReuniaoAcao" data-args-click="${argsAttr(r.sessaoId)}">Encerrar</button>` : ""}
        <button class="btn-link" data-on-click="baixarMinutaAta" data-args-click="${argsAttr(r.sessaoId)}">📝 Minuta (.docx)</button>
        ${r.orgaoSigla === "ASSEMBLEIA_GERAL" ? `<button class="btn-link" data-on-click="abrirCredenciamentoAssembleia" data-args-click="${argsAttr(r.sessaoId)}">🪪 Credenciamento</button>` : ""}
      </td>
    </tr>`;
  });

  html += "</tbody></table>";
  container.innerHTML = html;
}

// ---- Credenciamento de Assembleia (vB.13 — Reg. Art. 142-143) ----
// Mesa com trilha: RegistrarPresenca (v2.1) continua sendo o auto-atendimento
// por senha; isto é o fluxo operado pela Secretaria/mesa, que registra
// credenciamento OU recusa (com o artigo), o que faltava até aqui.
window._sessaoCredenciamentoAtual = null;

async function abrirCredenciamentoAssembleia(sessaoId) {
  window._sessaoCredenciamentoAtual = sessaoId;
  document.getElementById("painelCredenciamento").style.display = "block";
  document.getElementById("painelCredenciamento").scrollIntoView({ behavior: "smooth" });
  await carregarCredenciamento();
}

async function carregarCredenciamento() {
  const sessaoId = window._sessaoCredenciamentoAtual;
  if (!sessaoId) return;
  const res = await fetchProtegido(`${API_BASE}/credenciamento/${sessaoId}`);
  const data = await res.json();
  if (data.sucesso === false) {
    document.getElementById("resultadoCredenciamento").textContent = data.mensagem;
    return;
  }

  document.getElementById("avisoProcuracaoCredenciamento").textContent = data.avisoProcuracao;

  const impedidosContainer = document.getElementById("listaImpedidosCredenciamento");
  if (data.impedidos.length === 0) {
    impedidosContainer.innerHTML = "<p class='subtitle'>Nenhum impedimento calculado no momento.</p>";
  } else {
    impedidosContainer.innerHTML = `<table class="tabela-frequencia"><thead><tr><th>Nome</th><th>Motivo</th></tr></thead><tbody>` +
      data.impedidos.map(i => `<tr><td>${escaparHtmlEbd(i.nome)}</td><td>${escaparHtmlEbd(i.motivoArtigo)}: ${escaparHtmlEbd(i.motivoDetalhe)}</td></tr>`).join("") +
      `</tbody></table>`;
  }

  const trilhaContainer = document.getElementById("trilhaCredenciamento");
  if (data.credenciamentos.length === 0) {
    trilhaContainer.innerHTML = "<p class='subtitle'>Nenhum credenciamento operado pela mesa ainda.</p>";
  } else {
    trilhaContainer.innerHTML = `<table class="tabela-frequencia"><thead><tr><th>Nome</th><th>Resultado</th><th>Motivo</th><th>Quando</th></tr></thead><tbody>` +
      data.credenciamentos.map(c => `<tr><td>${escaparHtmlEbd(c.nome)}</td><td>${c.resultado === "CREDENCIADO" ? "✅ Credenciado" : "🚫 Recusado"}</td><td>${c.motivoArtigo ? `${escaparHtmlEbd(c.motivoArtigo)}: ${escaparHtmlEbd(c.motivoDetalhe)}` : "-"}</td><td>${escaparHtmlEbd(c.criadoEm)}</td></tr>`).join("") +
      `</tbody></table>`;
  }

  const relatorioContainer = document.getElementById("relatorioCredenciamento");
  relatorioContainer.textContent = data.relatorio
    ? `📋 Relatório congelado em ${data.relatorio.geradoEm}: ${data.relatorio.totalCredenciados} credenciados, ${data.relatorio.totalImpedidos} recusados na mesa.`
    : "Relatório de credenciamento ainda não foi gerado.";
}

async function credenciarMembroAcao() {
  const sessaoId = window._sessaoCredenciamentoAtual;
  const matricula = document.getElementById("credenciamentoMatricula").value;
  const msg = document.getElementById("resultadoCredenciamento");
  if (!sessaoId || !matricula) { msg.textContent = "Informe a matrícula."; return; }

  const res = await fetchProtegido(`${API_BASE}/credenciamento/${sessaoId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ membroId: matricula })
  });
  const data = await res.json();
  avisarResultado(data);
  document.getElementById("credenciamentoMatricula").value = "";
  carregarCredenciamento();
}

async function gerarRelatorioCredenciamentoAcao() {
  const sessaoId = window._sessaoCredenciamentoAtual;
  if (!sessaoId) return;
  if (!(await confirmarAcao("Gerar o relatório de credenciamento? Uma vez gerado, os totais ficam congelados (não recalculam depois).", "Gerar"))) return;
  const res = await fetchProtegido(`${API_BASE}/credenciamento/${sessaoId}/relatorio`, { method: "POST" });
  const data = await res.json();
  avisarResultado(data);
  carregarCredenciamento();
}

// ---- Elegíveis da Assembleia Geral (fica sempre disponível na aba Reuniões única) ----
let elegiveisAssembleia = [];
let elegiveisFiltrados = [];
let paginaAtualElegiveis = 1;

async function carregarElegiveisAssembleia() {
  const res = await fetchProtegido(`${API_BASE}/assembleia/elegiveis`);
  const lista = await jsonDaTela(res, document.getElementById("resultadoListaElegiveisAssembleia"), "lista");
  if (lista === null) { elegiveisAssembleia = []; return; }
  elegiveisAssembleia = lista;
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
    html += `<tr><td>${m.membroId}</td><td>${escaparHtmlEbd(m.nome)}</td><td>${escaparHtmlEbd(m.congregacao) || "-"}</td></tr>`;
  });
  html += "</tbody></table>";
  container.innerHTML = html;

  document.getElementById("assembleiaInfo").textContent = `${total} elegível(is)`;
  document.getElementById("assembleiaPaginacao").innerHTML = `
    <button ${paginaAtualElegiveis === 1 ? "disabled" : ""} data-on-click="mudarPaginaElegiveis" data-args-click="${argsAttr(-1)}">← Anterior</button>
    <span class="info-pagina">Página ${escaparHtmlEbd(paginaAtualElegiveis)} de ${totalPaginas}</span>
    <button ${paginaAtualElegiveis === totalPaginas ? "disabled" : ""} data-on-click="mudarPaginaElegiveis" data-args-click="${argsAttr(1)}">Próxima →</button>`;
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
      ? `<button class="btn-link" data-on-click="marcarPresencaManual" data-args-click="${argsAttr(sessaoId, item.membroId, false)}">Marcar falta</button>`
      : `<button class="btn-link" data-on-click="marcarPresencaManual" data-args-click="${argsAttr(sessaoId, item.membroId, true)}">Marcar presente</button>`;
    const pendenteHtml = item.justificativaPendente
      ? `<div class="tag-pendente">Pedido: "${escaparHtmlEbd(item.justificativaPendente)}"</div>
         <button class="btn-link btn-link-sucesso" data-on-click="aprovarJustificativaPendente" data-args-click="${argsAttr(sessaoId, item.membroId, String(item.justificativaPendente ?? ""))}">Aprovar</button>
         <button class="btn-link btn-link-perigo" data-on-click="rejeitarJustificativaAcao" data-args-click="${argsAttr(sessaoId, item.membroId)}">Rejeitar</button>`
      : "";
    html += `<tr>
      <td>${item.membroId}</td>
      <td>${escaparHtmlEbd(item.nome)}</td>
      <td>${escaparHtmlEbd(item.funcao) || "-"}</td>
      <td>${statusFrequencia(item)}</td>
      <td>${podeJustificar ? `<button class="btn-link" data-on-click="justificarFalta" data-args-click="${argsAttr(sessaoId, item.membroId)}">Justificar</button>` : ""} ${botaoCorrigir}${pendenteHtml}</td>
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
    fetchProtegido(`${API_BASE}/catalogos/departamentos`),
    fetchProtegido(`${API_BASE}/catalogos/cargosMinisteriais`),
    fetchProtegido(`${API_BASE}/catalogos/extensoes`),
    fetchProtegido(`${API_BASE}/catalogos/statuses`),
    fetchProtegido(`${API_BASE}/catalogos/situacoes`)
  ]);
  const congregacoes = await listaDaApi(resCong);
  const departamentos = await listaDaApi(resDepto);
  const cargos = await listaDaApi(resCargo);
  const extensoes = await listaDaApi(resExt);
  const statusesRaw = await resStatus.json();
  const statuses = Array.isArray(statusesRaw) ? statusesRaw : STATUS_DEFAULT;
  const situacoesRaw = await resSituacoes.json();
  const situacoes = Array.isArray(situacoesRaw) ? situacoesRaw : [];

  // Cacheados pra resolver nome (não só sigla/id) na aba Dados do Perfil.
  window._departamentosCache = departamentos;
  window._cargosCache = cargos;

  const selectCong = document.getElementById("pessoaCongregacao");
  selectCong.innerHTML = congregacoes.filter(c => c.ativa).map(c => `<option value="${c.congregacaoId}">${escaparHtmlEbd(c.nome)}</option>`).join("");

  const selectFiltroCong = document.getElementById("pessoasFiltroCongregacao");
  if (selectFiltroCong) {
    selectFiltroCong.innerHTML = `<option value="">Todas as congregações</option>` +
      congregacoes.map(c => `<option value="${c.congregacaoId}">${escaparHtmlEbd(c.nome)}</option>`).join("");
  }
  const selectFiltroSituacao = document.getElementById("pessoasFiltroSituacao");
  if (selectFiltroSituacao) {
    selectFiltroSituacao.innerHTML = `<option value="">Todas as situações</option>` +
      situacoes.filter(s => s.ativa !== false).map(s => `<option value="${escaparHtmlEbd(s.sigla)}">${escaparHtmlEbd(s.nome)}</option>`).join("");
  }

  const selectExt = document.getElementById("pessoaExtensao");
  const nomeCongPorId = Object.fromEntries(congregacoes.map(c => [String(c.congregacaoId), c.nome]));
  selectExt.innerHTML = `<option value="">Não se aplica (fica só na Congregação)</option>` +
    extensoes.filter(e => e.ativa).map(e => `<option value="${e.extensaoId}">${escaparHtmlEbd(e.nome)} (${escaparHtmlEbd(nomeCongPorId[String(e.congregacaoMaeId)]) || "?"})</option>`).join("");

  const selectDepto = document.getElementById("pessoaDepartamento");
  const deptosAtivos = departamentos.filter(d => d.ativo);
  const opcaoDepto = d => `<option value="${d.departamentoId}">${escaparHtmlEbd(d.nome)}</option>`;
  const grupoDepto = (rotulo, itens) => itens.length ? `<optgroup label="${rotulo}">${itens.map(opcaoDepto).join("")}</optgroup>` : "";
  selectDepto.innerHTML = `<option value="">Não informado</option>` +
    grupoDepto("Departamentos", deptosAtivos.filter(d => d.tipo === "DEPARTAMENTO")) +
    grupoDepto("Secretarias Adjuntas", deptosAtivos.filter(d => d.tipo === "SECRETARIA_ADJUNTA")) +
    grupoDepto("Outros", deptosAtivos.filter(d => d.tipo !== "DEPARTAMENTO" && d.tipo !== "SECRETARIA_ADJUNTA"));

  const selectCargo = document.getElementById("pessoaCargoMinisterial");
  selectCargo.innerHTML = `<option value="">Não informado</option>` +
    cargos.filter(c => c.ativo).sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0)).map(c => `<option value="${escaparHtmlEbd(c.sigla)}">${escaparHtmlEbd(c.nome)}</option>`).join("");

  const selectStatus = document.getElementById("pessoaStatus");
  selectStatus.innerHTML = statuses
    .filter(s => s.ativa !== false)
    .map(s => `<option value="${escaparHtmlEbd(s.sigla)}">${escaparHtmlEbd(s.nome)}</option>`).join("");
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
      `<button class="btn-link" data-on-click="abrirPerfilPessoa" data-args-click="${argsAttr(idSalvo)}">→ Ver perfil desta pessoa</button>`;
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
  window._membroApresentacoesAtual = membroId;
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

const ABAS_PERFIL = ["dados", "editar", "historico", "foto", "casamentos", "apresentacoes", "licenca", "vinculos"];

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
  if (aba === "apresentacoes") carregarApresentacoesCrianca(membroId);
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
      ${p.fotoUrl ? `<img src="${urlSegura(p.fotoUrl)}" alt="Foto" style="max-width:120px;border-radius:8px;margin-bottom:8px;" />` : ""}
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
    ${saidaHtml}
    <div class="cartao-perfil" style="margin-top:12px;">
      <h4 style="margin:0 0 8px; color: var(--cor-primaria);">Site institucional (vC.3)</h4>
      <div id="historicoSiteMembro"><p class="subtitle">Carregando…</p></div>
    </div>
    ${authPermissoes.includes("pessoas") ? `
    <div class="cartao-perfil" style="margin-top:12px;">
      <h4 style="margin:0 0 8px; color: var(--cor-primaria);">Acesso ao Meu Painel (PIN)</h4>
      <p class="subtitle">O membro entra com a matrícula e um PIN de 4 números que ele mesmo cria, confirmando o e-mail cadastrado. Para quem não tem e-mail (ou perdeu o acesso a ele), gere um PIN provisório e entregue pessoalmente.</p>
      <button class="btn-confirmar btn-secundario" style="width:auto;margin:0;" data-on-click="gerarPinProvisorioAcao" data-args-click="${argsAttr(Number(membroId))}">🔐 Gerar PIN provisório</button>
      <div id="resultadoPinProvisorio"></div>
    </div>` : ""}`;
  carregarHistoricoSiteMembro(membroId);
}

// vC.3 — o que essa pessoa já fez no site institucional (inscrições em
// evento, pedidos de camiseta), casado só por e-mail — nunca funde com a
// conta dela lá (Minha Conta continua existindo e funcionando sozinha,
// mesmo que ela vire ou deixe de ser membro depois).
async function carregarHistoricoSiteMembro(membroId) {
  const container = document.getElementById("historicoSiteMembro");
  if (!container) return;
  const res = await fetchProtegido(`${API_BASE}/historico-site-membro?matricula=${membroId}`);
  const dados = await jsonDaTela(res, container, "objeto");
  if (dados === null) return;

  if (!dados.temEmail) {
    container.innerHTML = "<p class='subtitle'>Sem e-mail cadastrado — não dá pra cruzar com o site.</p>";
    return;
  }
  if (dados.indisponivel) {
    container.innerHTML = "<p class='subtitle'>Não foi possível consultar o site agora.</p>";
    return;
  }
  if (dados.inscricoes.length === 0 && dados.pedidos.length === 0) {
    container.innerHTML = "<p class='subtitle'>Nenhuma inscrição em evento nem pedido de camiseta encontrado pelo e-mail cadastrado.</p>";
    return;
  }

  let html = "";
  if (dados.inscricoes.length > 0) {
    html += `<p class="subtitle">Inscrições em eventos:</p><ul>` +
      dados.inscricoes.map(i => `<li>${escaparHtmlEbd(i.eventoTitulo) || "Evento"} ${i.eventoData ? `(${escaparHtmlEbd(i.eventoData)})` : ""} ${i.presente ? "— presença confirmada" : ""}</li>`).join("") +
      `</ul>`;
  }
  if (dados.pedidos.length > 0) {
    html += `<p class="subtitle">Pedidos de camiseta:</p><ul>` +
      dados.pedidos.map(p => `<li>${escaparHtmlEbd(p.grupo) || "Camiseta"} — R$ ${Number(p.valorPago || 0).toFixed(2)} pago</li>`).join("") +
      `</ul>`;
  }
  container.innerHTML = html;
}

// Substitui a antiga verFotoMembro() — mesma lógica, só sem controlar
// mostrar/esconder bloco nem rolar tela (isso agora é mostrarAbaPerfil()).
function carregarAbaFoto(membroId) {
  const pessoa = (window._pessoasCache || []).find(p => p.membroId === membroId);
  document.getElementById("resultadoFotoMembro").textContent = "";
  const preview = document.getElementById("fotoMembroPreview");
  preview.innerHTML = pessoa && pessoa.fotoUrl
    ? `<img src="${urlSegura(pessoa.fotoUrl)}" alt="Foto" style="max-width:160px;border-radius:8px;" />`
    : "<span class='subtitle'>Sem foto cadastrada.</span>";

  fetchProtegido(`${API_BASE}/lgpd/consentimento/${membroId}`).then(r => r.json()).then(data => {
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
  const lista = await jsonDaTela(res, document.getElementById("resultadoListaPessoas"), "lista");
  if (lista === null) { window._pessoasCache = []; return; } // recusa: o motivo fica no lugar da lista
  window._pessoasCache = lista;
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

// O antigo onchange="importacaoPessoasLinhas[i].decisao = this.value" (CSP forte: código não fica mais no HTML): guarda a decisão escolhida na linha i.
function definirDecisaoImportacao(indice, valor) {
  importacaoPessoasLinhas[indice].decisao = valor;
}

function abrirModalRevisaoImportacaoPessoas() {
  const caixa = document.getElementById("modalCaixa");
  const linhasHtml = importacaoPessoasLinhas.map((l, i) => {
    if (l.status === "DUPLICATA_MATRICULA") {
      return `<tr>
        <td>${l.membroId}</td><td>${escaparHtmlEbd(l.nome)}</td><td>${escaparHtmlEbd(l.situacaoMembro) || "-"}</td>
        <td>Matrícula já existe: <strong>${escaparHtmlEbd(l.conflito.nome)}</strong></td>
        <td>
          <select data-on-change="definirDecisaoImportacao" data-args-change="${argsAttr(i, ARG.valor)}">
            <option value="MANTER" ${l.decisao === "MANTER" ? "selected" : ""}>Manter o que já está (ignorar)</option>
            <option value="ATUALIZAR" ${l.decisao === "ATUALIZAR" ? "selected" : ""}>Atualizar pessoa existente</option>
          </select>
        </td>
      </tr>`;
    }
    if (l.status === "POSSIVEL_DUPLICATA_NOME") {
      return `<tr>
        <td>${l.membroId}</td><td>${escaparHtmlEbd(l.nome)}</td><td>${escaparHtmlEbd(l.situacaoMembro) || "-"}</td>
        <td>Nome ${Math.round(l.similaridade * 100)}% parecido com <strong>${escaparHtmlEbd(l.conflito.nome)}</strong> (matrícula ${l.conflito.membroId})</td>
        <td>
          <select data-on-change="definirDecisaoImportacao" data-args-change="${argsAttr(i, ARG.valor)}">
            <option value="IGNORAR" ${l.decisao === "IGNORAR" ? "selected" : ""}>Ignorar esta linha</option>
            <option value="IMPORTAR" ${l.decisao === "IMPORTAR" ? "selected" : ""}>Importar mesmo assim (é pessoa nova)</option>
          </select>
        </td>
      </tr>`;
    }
    return `<tr>
      <td>${l.membroId}</td><td>${escaparHtmlEbd(l.nome)}</td><td>${escaparHtmlEbd(l.situacaoMembro) || "-"}</td>
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

// vB.8 — `sensivel: true` marca colunas restritas a nível Global em
// exportação em massa (ver ExportarPessoas) — dado de contato/nascimento
// em lote é o que a LGPD mais protege contra compartilhamento externo.
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
  { chave: "telefone", rotulo: "Telefone", padrao: false, sensivel: true },
  { chave: "email", rotulo: "E-mail", padrao: false, sensivel: true },
  { chave: "endereco", rotulo: "Endereço", padrao: false, sensivel: true },
  { chave: "dataNascimento", rotulo: "Data de Nascimento", padrao: false, sensivel: true },
  { chave: "dataAdmissao", rotulo: "Data de Admissão", padrao: false }
];

function abrirModalExportarPessoas() {
  const caixa = document.getElementById("modalCaixa");
  // vB.8 — quem não é nível Global nem vê a opção de coluna sensível (a
  // API também recusaria — isso é só não oferecer o que seria negado).
  const colunasDisponiveis = COLUNAS_EXPORT_PESSOAS.filter(c => !c.sensivel || authNivel === "GLOBAL");
  const checkboxesHtml = colunasDisponiveis.map(c => `
    <label style="display:flex;align-items:center;gap:6px;margin:4px 0;">
      <input type="checkbox" id="exportCol_${escaparHtmlEbd(c.chave)}" ${c.padrao ? "checked" : ""} /> ${escaparHtmlEbd(c.rotulo)}${c.sensivel ? " 🔒" : ""}
    </label>`).join("");

  caixa.innerHTML = `
    <h3>Exportar Pessoas (${pessoasFiltradas.length} registro(s) na lista filtrada)</h3>
    <p class="subtitle">Escolha as colunas que devem entrar na planilha. Toda exportação fica registrada na Auditoria.</p>
    <div style="max-height:300px;overflow-y:auto;">${checkboxesHtml}</div>
    <div class="modal-acoes">
      <button class="btn-confirmar btn-secundario" id="modalCancelar">Cancelar</button>
      <button class="btn-confirmar" id="modalConfirmar">📤 Gerar Planilha</button>
    </div>`;
  document.getElementById("modalOverlay").classList.remove("escondido");
  document.getElementById("modalConfirmar").onclick = () => exportarPessoasAcao();
  document.getElementById("modalCancelar").onclick = () => fecharModal();
}

async function exportarPessoasAcao() {
  const colunasSelecionadas = COLUNAS_EXPORT_PESSOAS.filter(c => document.getElementById(`exportCol_${c.chave}`) && document.getElementById(`exportCol_${c.chave}`).checked);
  if (colunasSelecionadas.length === 0) {
    mostrarToast("Selecione ao menos uma coluna.", "erro");
    return;
  }

  // vB.8 — passa pelo servidor ANTES de gerar o arquivo: registra a
  // exportação na Auditoria e confere de novo (não só confia no que o
  // modal já escondeu) se colunas sensíveis exigem nível Global. Não
  // reconsulta o banco (os dados já estão em `pessoasFiltradas`, já
  // carregados com o escopo de quem está logado) — só valida e audita.
  const res = await fetchProtegido(`${API_BASE}/pessoas/exportar`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ colunas: colunasSelecionadas.map(c => c.chave), quantidade: pessoasFiltradas.length })
  });
  const data = await res.json();
  if (!data.sucesso) { avisarResultado(data); return; }

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
      ? `<img src="${urlSegura(p.fotoUrl)}" alt="Foto de ${escaparHtmlEbd(p.nome)}" style="width:32px;height:32px;border-radius:50%;object-fit:cover;display:block;" />`
      : `<span style="display:flex;align-items:center;justify-content:center;width:32px;height:32px;border-radius:50%;background:#e5e5e5;color:#888;font-size:0.75rem;">?</span>`;
    html += `<tr>
      <td>${miniatura}</td>
      <td>${p.membroId}</td>
      <td>${escaparHtmlEbd(p.nome)}</td>
      <td>${escaparHtmlEbd(p.congregacao) || "-"}</td>
      <td>${badgeStatusPessoa(p.status)}</td>
      <td>${escaparHtmlEbd(p.situacaoMembro) || "-"}</td>
      <td class="acoes-inline">
        <button class="btn-link" data-on-click="abrirPerfilPessoa" data-args-click="${argsAttr(p.membroId)}">👁️ Ver Perfil</button>
      </td>
    </tr>`;
  });

  html += "</tbody></table>";
  container.innerHTML = html;

  document.getElementById("pessoasInfo").textContent = `${total} pessoa(s)`;
  document.getElementById("pessoasPaginacao").innerHTML = `
    <button ${paginaAtualPessoas === 1 ? "disabled" : ""} data-on-click="mudarPaginaPessoas" data-args-click="${argsAttr(-1)}">← Anterior</button>
    <span class="info-pagina">Página ${escaparHtmlEbd(paginaAtualPessoas)} de ${totalPaginas}</span>
    <button ${paginaAtualPessoas === totalPaginas ? "disabled" : ""} data-on-click="mudarPaginaPessoas" data-args-click="${argsAttr(1)}">Próxima →</button>`;
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
  const res = await fetchProtegido(`${API_BASE}/cartas/minhas?matricula=${authMatricula}`);
  const cartas = await jsonDaTela(res, caixa, "lista");
  if (cartas === null) return;
  minhasCartasCache = Array.isArray(cartas) ? cartas : [];
  if (minhasCartasCache.length === 0) {
    caixa.innerHTML = `<p class="subtitle">Nenhuma carta solicitada ainda.</p>`;
    return;
  }
  caixa.innerHTML = `<table class="tabela-frequencia"><thead><tr><th>Tipo</th><th>Status</th><th>Pedido</th><th>Validade</th><th></th></tr></thead><tbody>` +
    minhasCartasCache.map(c => `<tr>
      <td>${ROTULO_CARTA[c.tipo] || escaparHtmlEbd(c.tipo)}</td>
      <td>${escaparHtmlEbd(c.status)}</td>
      <td>${escaparHtmlEbd(c.dataPedido) || "-"}</td>
      <td>${escaparHtmlEbd(c.dataValidade) || "-"}</td>
      <td class="acoes-inline">
        ${c.tipo === "MUDANCA" && c.status === "SOLICITADA" ? `<button class="btn-link" data-on-click="confirmarCartaPendente">Confirmar</button>` : ""}
        ${c.status !== "SOLICITADA" ? `<button class="btn-link" data-on-click="imprimirMinhaCarta" data-args-click="${argsAttr(c.cartaId)}">🖨️ Imprimir</button>` : ""}
        ${["EMITIDA", "CONFIRMADA"].includes(c.status) ? `<button class="btn-link" data-on-click="baixarPdfCarta" data-args-click="${argsAttr(c.cartaId, c.membroId)}">📄 Baixar PDF</button>` : ""}
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
    const manterAcessoSite = await confirmarAcao(
      "Você quer manter acesso ao site institucional (Minha Conta, com seu e-mail atual) mesmo depois de desligado? Se sim, garantimos essa conta agora, antes da minimização apagar seu e-mail daqui. Se não, seus dados são só minimizados, como sempre.",
      "Manter acesso ao site"
    );
    await fetchProtegido(`${API_BASE}/cartas/minhas`, { method: "POST", headers, body: JSON.stringify({ matricula, tipo }) });
    const res2 = await fetchProtegido(`${API_BASE}/cartas/minhas`, { method: "POST", headers, body: JSON.stringify({ matricula, tipo, confirmar: true, manterAcessoSite }) });
    const data2 = await res2.json();
    msg.textContent = data2.mensagem;
    carregarMinhasCartas();
    return;
  }

  const res = await fetchProtegido(`${API_BASE}/cartas/minhas`, { method: "POST", headers, body: JSON.stringify({ matricula, tipo }) });
  const data = await res.json();
  msg.textContent = data.mensagem;
  carregarMinhasCartas();
}

async function confirmarCartaPendente() {
  if (!authMatricula) return;
  const ok = await confirmarAcao("Confirmar esta solicitação de Carta de Mudança (declaração de ciência do desligamento)?", "Confirmar");
  if (!ok) return;
  const manterAcessoSite = await confirmarAcao(
    "Você quer manter acesso ao site institucional (Minha Conta, com seu e-mail atual) mesmo depois de desligado? Se sim, garantimos essa conta agora, antes da minimização apagar seu e-mail daqui. Se não, seus dados são só minimizados, como sempre.",
    "Manter acesso ao site"
  );
  const res = await fetchProtegido(`${API_BASE}/cartas/minhas`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ matricula: Number(authMatricula), tipo: "MUDANCA", confirmar: true, manterAcessoSite })
  });
  const data = await res.json();
  avisarResultado(data);
  carregarMinhasCartas();
}
let cartasCache = [];
async function carregarCartas() {
  const res = await fetchProtegido(`${API_BASE}/cartas`);
  const lista = await jsonDaTela(res, document.getElementById("resultadoListaCartas"), "lista");
  if (lista === null) { cartasCache = []; return; }
  cartasCache = lista;
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
      <td>${escaparHtmlEbd(c.nome)} (${c.membroId})</td>
      <td>${ROTULO_CARTA[c.tipo] || escaparHtmlEbd(c.tipo)}</td>
      <td><span class="badge-status ${cores[c.status] || ""}">${escaparHtmlEbd(c.status)}</span></td>
      <td>${escaparHtmlEbd(c.destino) || "-"}</td>
      <td>${escaparHtmlEbd(c.dataPedido) || "-"}</td>
      <td>${escaparHtmlEbd(c.dataValidade) || "-"}</td>
      <td class="acoes-inline">
        ${["SOLICITADA", "CONFIRMADA"].includes(c.status) ? `<button class="btn-link" data-on-click="emitirCarta" data-args-click="${argsAttr(c.cartaId)}">Emitir</button>` : ""}
        ${["SOLICITADA", "CONFIRMADA", "EMITIDA"].includes(c.status) ? `<button class="btn-link btn-link-perigo" data-on-click="cancelarCarta" data-args-click="${argsAttr(c.cartaId)}">Cancelar</button>` : ""}
        <button class="btn-link" data-on-click="imprimirCarta" data-args-click="${argsAttr(c.cartaId)}">🖨️ Imprimir</button>
        ${["EMITIDA", "CONFIRMADA"].includes(c.status) ? `<button class="btn-link" data-on-click="baixarPdfCarta" data-args-click="${argsAttr(c.cartaId, c.membroId)}">📄 Baixar PDF</button>` : ""}
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

// vB.6 — PDF gerado no servidor (protocolo único + rodapé de emissão),
// substitui "salvar como PDF" do navegador pra quem precisa de um arquivo
// de verdade, não só imprimir na hora.
async function baixarPdfCarta(cartaId, membroId) {
  const res = await fetchProtegido(`${API_BASE}/cartas/${cartaId}/pdf?matricula=${membroId}`);
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    mostrarToast((data && data.mensagem) || "Não foi possível gerar o PDF.", "erro");
    return;
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `carta-${cartaId}.pdf`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
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
  w.document.write(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${escaparHtmlEbd(rotulo)}</title>
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
    <p>Parauapebas, PA, ${escaparHtmlEbd(dataEmissaoFmt)}.</p>
    <p>Saudações no SENHOR JESUS.</p>
    <p>Apresentamos à Igreja em <strong>${escaparHtmlEbd(c.destino) || "______________________"}</strong> o(a) portador(a) desta carta o(a) Sr(a). <strong>${escaparHtmlEbd(c.nome)}</strong> (Cartão de Membro nº ${c.membroId}).</p>
    <div class="linha"><span>${marcarOpcao("Membro", !ehCongregado)}</span><span>${marcarOpcao("Congregado", ehCongregado)}</span></div>
    <p>Nesta Igreja desde ${c.dataAdmissao ? escaparHtmlEbd(c.dataAdmissao.split("-").reverse().join("/")) : "____/____/______"}, por se achar em: <strong>${situacaoRotulo}</strong>.</p>
    <p>Nós o(a) recomendamos que recebais no Senhor, como usam os Santos.</p>
    <div class="linha">
      <span><strong>Função:</strong> ${escaparHtmlEbd(c.funcao) || "—"}</span>
      <span><strong>Cargo:</strong> ${LABEL_CARGO_MINISTERIAL[c.cargoMinisterial] || "—"}</span>
      <span><strong>Estado Civil:</strong> ${LABEL_ESTADO_CIVIL[c.estadoCivil] || "—"}</span>
    </div>
    ${c.declaracaoCiencia ? `<p class="decl">${escaparHtmlEbd(c.declaracaoCiencia)}</p>` : ""}
    ${(c.motivoSaida || c.destino) ? `<p class="obs"><strong>OBS:</strong> ${escaparHtmlEbd(c.motivoSaida) || ""}</p>` : ""}
    <div class="rodape"><div>Pastor Congregacional</div><div>Secretário Local(a)</div></div>
    <p class="validade">${c.dataValidade ? `VALIDADE: até ${escaparHtmlEbd(c.dataValidade.split("-").reverse().join("/"))}` : (c.tipo === "MUDANCA" ? "" : "VALIDADE: 30 dias a partir da data de emissão")}</p>
  </div></body></html>`);
  w.document.close();
  setTimeout(() => { try { w.focus(); w.print(); } catch (e) {} }, 300);
}

// ---- Vínculos Familiares (seção dentro do cadastro de uma Pessoa) ----
// Núcleo mínimo (v0.2): cadastro do relacionamento em si. O cálculo de grau de
// parentesco por travessia nasce em v2.6/v3.1, quando tiver um consumidor de verdade.
async function carregarOpcoesTipoVinculo() {
  const select = document.getElementById("vinculoTipo");
  const res = await fetchProtegido(`${API_BASE}/catalogos/tiposVinculoFamiliar`);
  const tipos = await jsonDaTela(res, select, "objeto");
  if (tipos === null) return;
  select.innerHTML = tipos.filter(t => t.ativo !== false).map(t => `<option value="${t.tipoVinculoId}">${escaparHtmlEbd(t.rotuloDireto)}</option>`).join("");
}

async function carregarVinculosFamiliares(membroId) {
  const container = document.getElementById("resultadoListaVinculosFamiliares");
  const res = await fetchProtegido(`${API_BASE}/vinculos-familiares?membroId=${membroId}`);
  const vinculos = await jsonDaTela(res, container, "objeto");
  if (vinculos === null) return;

  if (vinculos.length === 0) {
    container.innerHTML = "<p class='subtitle'>Nenhum vínculo familiar cadastrado.</p>";
    return;
  }

  let html = `<table class="tabela-frequencia"><thead><tr><th>Parentesco</th><th>Pessoa</th><th></th></tr></thead><tbody>`;
  vinculos.forEach(v => {
    html += `<tr>
      <td>${escaparHtmlEbd(v.rotulo)}</td>
      <td>${escaparHtmlEbd(v.outraPessoaNome)} (${v.outraPessoaId})${v.outraPessoaEhResponsavel ? ' <span class="badge-status badge-ativo">Responsável Legal</span>' : ""}</td>
      <td class="acoes-inline"><button class="btn-link btn-link-perigo" data-on-click="removerVinculoFamiliar" data-args-click="${argsAttr(v.vinculoId)}">Remover</button></td>
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
    const podeCorrigir = e.marcoId != null && authGeral;
    return `<li>
      <strong>${escaparHtmlEbd(e.data) || "data não informada"}</strong> — ${escaparHtmlEbd(e.titulo)}
      ${e.descricao ? `<br><span class="subtitle">${escaparHtmlEbd(e.descricao)}</span>` : ""}
      ${podeCorrigir ? ` <button class="btn-link" data-on-click="corrigirMarcoMembroAcao" data-args-click="${argsAttr(e.marcoId)}">Corrigir</button>` : ""}
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
      <h3>Corrigir marco: ${ROTULO_TIPO_MARCO[marco.tipo] || escaparHtmlEbd(marco.tipo)}</h3>
      <div class="input-group">
        <label>Descrição:</label>
        <input type="text" id="modalDescricao" value="${escaparHtmlEbd(marco.descricao || "")}" />
      </div>
      <div class="input-group">
        <label>Data:</label>
        <input type="date" id="modalData" value="${escaparHtmlEbd(marco.dataMarco) || ""}" />
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
  const res = await fetchProtegido(`${API_BASE}/lgpd/consentimento/${membroId}`, {
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
  const casamentos = await jsonDaTela(res, container, "lista");
  if (casamentos === null) return;
  if (!Array.isArray(casamentos) || casamentos.length === 0) {
    container.innerHTML = "<p class='subtitle'>Nenhum casamento registrado ainda.</p>";
    return;
  }
  let html = `<table class="tabela-frequencia"><thead><tr>
    <th>Cônjuge</th><th>Modalidade</th><th>Celebrante</th><th>Data</th><th>Cartório</th><th></th>
  </tr></thead><tbody>`;
  casamentos.forEach(c => {
    html += `<tr>
      <td>${escaparHtmlEbd(c.nomeMembroConjuge) || escaparHtmlEbd(c.nomeConjuge) || "-"}</td>
      <td>${ROTULO_MODALIDADE_CASAMENTO[c.modalidade] || escaparHtmlEbd(c.modalidade)}</td>
      <td>${escaparHtmlEbd(c.celebrante) || "-"}</td>
      <td>${escaparHtmlEbd(c.dataCasamento) || "-"}</td>
      <td>${c.registradoCartorio ? "✅ Sim" : "Não"}</td>
      <td><button class="btn-link btn-link-perigo" data-on-click="excluirCasamentoAcao" data-args-click="${argsAttr(c.casamentoId)}">Excluir</button></td>
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

// ---- APRESENTAÇÃO DE CRIANÇAS (vB.12 — Reg. Art. 82) ----
const ROTULO_MODALIDADE_APRESENTACAO = { SOLENE: "Solene", RESERVADA: "Reservada" };

async function carregarApresentacoesCrianca(membroId) {
  const container = document.getElementById("resultadoListaApresentacoes");
  const res = await fetchProtegido(`${API_BASE}/apresentacoes-crianca?membroId=${membroId}`);
  const apresentacoes = await jsonDaTela(res, container, "lista");
  if (apresentacoes === null) return;
  if (!Array.isArray(apresentacoes) || apresentacoes.length === 0) {
    container.innerHTML = "<p class='subtitle'>Nenhuma apresentação de criança registrada ainda.</p>";
    return;
  }
  let html = `<table class="tabela-frequencia"><thead><tr>
    <th>Criança</th><th>Nascimento</th><th>Modalidade</th><th>Data</th><th>Aptidão</th><th></th>
  </tr></thead><tbody>`;
  apresentacoes.forEach(a => {
    const aptidaoTexto = a.aptidao?.apto ? "✅ Apta" : "⚠️ " + Object.values(a.aptidao?.itens || {}).filter(i => !i.ok).map(i => escaparHtmlEbd(i.detalhe)).join("; ");
    html += `<tr>
      <td>${escaparHtmlEbd(a.nomeCrianca)}</td>
      <td>${escaparHtmlEbd(a.dataNascimento) || "-"}</td>
      <td>${ROTULO_MODALIDADE_APRESENTACAO[a.modalidade] || escaparHtmlEbd(a.modalidade)}</td>
      <td>${escaparHtmlEbd(a.dataApresentacao) || "-"}</td>
      <td>${aptidaoTexto}</td>
      <td>
        ${a.geraCertificado ? `<a class="btn-link" href="${API_BASE}/apresentacoes-crianca/${a.apresentacaoId}/pdf" target="_blank">📄 Certificado</a>` : ""}
        <button class="btn-link btn-link-perigo" data-on-click="excluirApresentacaoCriancaAcao" data-args-click="${argsAttr(a.apresentacaoId)}">Excluir</button>
      </td>
    </tr>`;
  });
  html += "</tbody></table>";
  container.innerHTML = html;
}

async function salvarApresentacaoCrianca() {
  const membroId = window._membroApresentacoesAtual;
  const msg = document.getElementById("resultadoApresentacaoCrianca");
  if (!membroId) return;

  const nomeCrianca = document.getElementById("apresentacaoNomeCrianca").value.trim();
  const dataNascimento = document.getElementById("apresentacaoDataNascimento").value;
  const papel = document.getElementById("apresentacaoPapelPerfil").value;
  const outroPaiMatricula = document.getElementById("apresentacaoOutroPaiMatricula").value || null;
  const oficiante = document.getElementById("apresentacaoOficiante").value.trim() || null;
  const modalidade = document.getElementById("apresentacaoModalidade").value;
  const dataApresentacao = document.getElementById("apresentacaoData").value;

  if (!nomeCrianca || !dataNascimento || !dataApresentacao) {
    msg.textContent = "Informe nome da criança, data de nascimento e data da apresentação.";
    return;
  }

  const membroIdPai = papel === "PAI" ? membroId : outroPaiMatricula;
  const membroIdMae = papel === "MAE" ? membroId : outroPaiMatricula;

  const res = await fetchProtegido(`${API_BASE}/apresentacoes-crianca`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ nomeCrianca, dataNascimento, membroIdPai, membroIdMae, oficiante, modalidade, dataApresentacao })
  });
  const data = await res.json();
  avisarResultado(data);
  msg.textContent = data.aviso || "";
  if (data.sucesso) {
    document.getElementById("apresentacaoNomeCrianca").value = "";
    document.getElementById("apresentacaoDataNascimento").value = "";
    document.getElementById("apresentacaoOutroPaiMatricula").value = "";
    document.getElementById("apresentacaoOficiante").value = "";
    document.getElementById("apresentacaoData").value = "";
    carregarApresentacoesCrianca(membroId);
  }
}

async function excluirApresentacaoCriancaAcao(apresentacaoId) {
  if (!(await confirmarAcao("Confirma excluir este registro de apresentação? (correção de lançamento)", "Excluir"))) return;
  const res = await fetchProtegido(`${API_BASE}/apresentacoes-crianca/${apresentacaoId}`, { method: "DELETE" });
  const data = await res.json();
  avisarResultado(data);
  if (data.sucesso) carregarApresentacoesCrianca(window._membroApresentacoesAtual);
}

// ---- LICENÇA POR CANDIDATURA (v1.9 — Reg. Art. 157 §2º) ----
const ROTULO_STATUS_LICENCA = { EM_LICENCA: "Em licença", RETORNOU: "Retornou", NAO_RETORNOU: "Não retornou" };

async function carregarLicencasCandidatura(membroId) {
  const container = document.getElementById("resultadoListaLicencasCandidatura");
  const res = await fetchProtegido(`${API_BASE}/licencas-candidatura?membroId=${membroId}`);
  const licencas = await jsonDaTela(res, container, "lista");
  if (licencas === null) return;
  if (!Array.isArray(licencas) || licencas.length === 0) {
    container.innerHTML = "<p class='subtitle'>Nenhuma licença por candidatura registrada ainda.</p>";
    return;
  }
  let html = `<table class="tabela-frequencia"><thead><tr>
    <th>Pleito</th><th>Início da Licença</th><th>Status</th><th></th>
  </tr></thead><tbody>`;
  licencas.forEach(l => {
    html += `<tr>
      <td>${escaparHtmlEbd(l.dataPleito) || "-"}</td>
      <td>${escaparHtmlEbd(l.dataInicioLicenca) || "-"}</td>
      <td>${ROTULO_STATUS_LICENCA[l.status] || escaparHtmlEbd(l.status)}</td>
      <td>${authGeral && l.status === "EM_LICENCA" ? `<button class="btn-link" data-on-click="registrarRetornoLicencaAcao" data-args-click="${argsAttr(l.licencaId)}">Registrar retorno</button>` : "-"}</td>
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
  const solicitacoes = await jsonDaTela(res, container, "lista");
  if (solicitacoes === null) return;
  filaAprovacoesCache = Array.isArray(solicitacoes) ? solicitacoes : [];

  if (filaAprovacoesCache.length === 0) {
    container.innerHTML = "<p class='subtitle'>Nenhum pedido pendente no momento.</p>";
    return;
  }

  container.innerHTML = filaAprovacoesCache.map(s => `
    <div class="cartao-perfil" style="margin-bottom:16px;">
      <div class="barra-lista" style="justify-content:space-between;">
        <h4 style="margin:0; color: var(--cor-primaria);">${escaparHtmlEbd(s.nome)} (matrícula ${s.membroId}) — ${new Date(s.dataSolicitacao).toLocaleDateString("pt-BR")}</h4>
        <button class="btn-confirmar" style="width:auto;margin:0;" data-on-click="aprovarTodaSolicitacaoAcao" data-args-click="${argsAttr(s.solicitacaoId)}">✅ Aprovar tudo</button>
      </div>
      <div class="rolagem-tabela"><table class="tabela-frequencia"><thead><tr>
        <th>Campo</th><th>Valor Atual</th><th>Valor Proposto</th><th></th>
      </tr></thead><tbody>
        ${s.campos.map(c => `<tr>
          <td>${escaparHtmlEbd(c.rotulo)}</td>
          <td>${escaparHtmlEbd(c.valorAnterior) || "-"}</td>
          <td><strong>${escaparHtmlEbd(c.valorProposto)}</strong></td>
          <td class="acoes-inline">
            <button class="btn-link" data-on-click="decidirCampoFilaAcao" data-args-click="${argsAttr(s.solicitacaoId, c.campoId, "APROVADO")}">Aprovar</button>
            <button class="btn-link btn-link-perigo" data-on-click="decidirCampoFilaAcao" data-args-click="${argsAttr(s.solicitacaoId, c.campoId, "REJEITADO")}">Rejeitar</button>
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

// ---- SECRETARIA / ABA CONSAGRAÇÕES ----
// Os tipos de proposta ("Assunto") são um catálogo configurável (Catálogos ->
// Tipos de Proposta), não mais uma lista fixa no HTML — dá pra adicionar/
// renomear/excluir tipo sem mexer em código.
async function carregarTiposConsagracao() {
  const select = document.getElementById("consagracaoAssunto");
  const res = await fetchProtegido(`${API_BASE}/catalogos/tiposConsagracao`);
  const tipos = await jsonDaTela(res, select, "objeto");
  if (tipos === null) return;
  select.innerHTML = tipos.filter(t => t.ativo !== false).map(t => `<option value="${escaparHtmlEbd(t.nome)}">${escaparHtmlEbd(t.nome)}</option>`).join("")
    + `<option value="__outro">Outro (digitar)</option>`;
  document.getElementById("consagracaoAssuntoOutro").style.display = "none";
}

document.addEventListener("DOMContentLoaded", () => {
  const select = document.getElementById("consagracaoAssunto");
  if (select) select.addEventListener("change", () => {
    document.getElementById("consagracaoAssuntoOutro").style.display = select.value === "__outro" ? "block" : "none";
  });
});

// Trava de Revisão 4-A (v4.15.1): para origem CONGREGACAO a arrecadação
// líquida é calculada no backend a partir do fechamento mensal real da
// Tesouraria Local — o campo digitado só se aplica a DEPARTAMENTO/DISTRITO,
// que ainda não têm fechamento eletrônico próprio.
document.addEventListener("DOMContentLoaded", () => {
  const selectOrigem = document.getElementById("repasseOrigemTipo");
  const campoArrecadado = document.getElementById("repasseArrecadado");
  if (selectOrigem && campoArrecadado) {
    const grupoArrecadado = campoArrecadado.closest(".input-group") || campoArrecadado.parentElement;
    const atualizar = () => {
      const ehCongregacao = selectOrigem.value === "CONGREGACAO";
      if (grupoArrecadado) grupoArrecadado.style.display = ehCongregacao ? "none" : "";
      campoArrecadado.disabled = ehCongregacao;
    };
    selectOrigem.addEventListener("change", atualizar);
    atualizar();
  }
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
  const consagracoes = await jsonDaTela(res, container, "objeto");
  if (consagracoes === null) return;

  if (consagracoes.length === 0) {
    container.innerHTML = "<p class='subtitle'>Nenhum processo em andamento.</p>";
    return;
  }

  let html = `<table class="tabela-frequencia"><thead><tr>
    <th>Nome</th><th>Assunto</th><th>Proponente</th><th>Status</th><th>Protocolo</th><th></th>
  </tr></thead><tbody>`;

  consagracoes.forEach(c => {
    html += `<tr>
      <td>${escaparHtmlEbd(c.nome)}</td>
      <td>${escaparHtmlEbd(c.assunto)}</td>
      <td>${escaparHtmlEbd(c.proponente) || "-"}</td>
      <td>${ROTULO_STATUS_CONSAGRACAO[c.status] || escaparHtmlEbd(c.status)}</td>
      <td>${escaparHtmlEbd(c.dataProtocolo)}</td>
      <td>
        ${authGeral ? `<button class="btn-link" data-on-click="avancarConsagracaoAcao" data-args-click="${argsAttr(String(c.consagracaoId ?? ""))}">Avançar</button>
        <button class="btn-link btn-link-perigo" data-on-click="reprovarConsagracaoAcao" data-args-click="${argsAttr(String(c.consagracaoId ?? ""))}">Reprovar</button>` : "-"}
      </td>
    </tr>`;
  });

  html += "</tbody></table>";
  container.innerHTML = html;
}

// ---- ESTEIRA DE BATISMO (vB.11 — Regimento Art. 80) ----
const ROTULO_STATUS_TURMA_BATISMO = { ABERTA: "Aberta", REALIZADA: "Realizada", CANCELADA: "Cancelada" };
const ROTULO_TIPO_LOCAL_BATISMO = { TEMPLO: "Templo", OUTRO_APROVADO: "Outro local aprovado" };

async function salvarTurmaBatismoAcao() {
  const dataBatismo = document.getElementById("turmaBatismoData").value;
  const local = document.getElementById("turmaBatismoLocal").value.trim();
  const tipoLocal = document.getElementById("turmaBatismoTipoLocal").value;
  const oficiantesTexto = document.getElementById("turmaBatismoOficiantes").value.trim();
  const msg = document.getElementById("resultadoTurmaBatismo");
  if (!dataBatismo || !local) { msg.textContent = "Informe data e local."; return; }
  const oficiantesMembroIds = oficiantesTexto ? oficiantesTexto.split(",").map(s => s.trim()).filter(Boolean).map(Number) : [];

  const res = await fetchProtegido(`${API_BASE}/turmas-batismo`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ dataBatismo, local, tipoLocal, oficiantesMembroIds })
  });
  const data = await res.json();
  msg.textContent = data.mensagem || "";
  if (data.sucesso) {
    document.getElementById("turmaBatismoLocal").value = "";
    document.getElementById("turmaBatismoOficiantes").value = "";
    carregarTurmasBatismo();
  }
}

async function carregarTurmasBatismo() {
  const container = document.getElementById("resultadoListaTurmasBatismo");
  const res = await fetchProtegido(`${API_BASE}/turmas-batismo`);
  const turmas = await jsonDaTela(res, container, "lista");
  if (turmas === null) return;
  if (!Array.isArray(turmas) || turmas.length === 0) {
    container.innerHTML = "<p class='subtitle'>Nenhuma turma criada ainda.</p>";
    return;
  }
  container.innerHTML = `<table class="tabela-frequencia"><thead><tr>
    <th>Data</th><th>Local</th><th>Mesa</th><th>Candidatos</th><th>Status</th><th></th>
  </tr></thead><tbody>` + turmas.map(t => `
    <tr>
      <td>${new Date(t.dataBatismo).toLocaleDateString("pt-BR")}</td>
      <td>${escaparHtmlEbd(t.local)} <small>(${ROTULO_TIPO_LOCAL_BATISMO[t.tipoLocal] || escaparHtmlEbd(t.tipoLocal)})</small></td>
      <td>${t.autorizacaoMesa ? "✅" : "⏳"}</td>
      <td>${escaparHtmlEbd(t.totalCandidatos)}</td>
      <td>${ROTULO_STATUS_TURMA_BATISMO[t.status] || escaparHtmlEbd(t.status)}</td>
      <td class="acoes-inline">
        ${authGeral && t.status === "ABERTA" && !t.autorizacaoMesa ? `<button class="btn-link" data-on-click="acaoTurmaBatismo" data-args-click="${argsAttr(t.turmaId, "AUTORIZAR_MESA")}">Autorizar Mesa</button>` : ""}
        ${t.status === "ABERTA" ? `${authGeral ? `<button class="btn-link" data-on-click="acaoTurmaBatismo" data-args-click="${argsAttr(t.turmaId, "REALIZAR")}">Realizar</button>` : ""}
        <button class="btn-link btn-link-perigo" data-on-click="acaoTurmaBatismo" data-args-click="${argsAttr(t.turmaId, "CANCELAR")}">Cancelar</button>` : ""}
      </td>
    </tr>
  `).join("") + "</tbody></table>";
}

async function acaoTurmaBatismo(turmaId, acao) {
  const rotulos = { AUTORIZAR_MESA: "autorizar a Mesa pra", REALIZAR: "REALIZAR o batismo d", CANCELAR: "cancelar" };
  if (!(await confirmarAcao(`Confirma ${rotulos[acao]}esta turma?`, "Confirmar"))) return;
  const res = await fetchProtegido(`${API_BASE}/turmas-batismo/${turmaId}`, {
    method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ acao })
  });
  const data = await res.json();
  avisarResultado(data);
  if (data.sucesso) { carregarTurmasBatismo(); carregarCandidatosBatismo(); }
}

async function inscreverCandidatoBatismoAcao() {
  const membroId = document.getElementById("candidatoBatismoMatricula").value;
  const msg = document.getElementById("resultadoCandidatoBatismo");
  if (!membroId) { msg.textContent = "Informe a matrícula."; return; }
  const res = await fetchProtegido(`${API_BASE}/candidatos-batismo`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ membroId })
  });
  const data = await res.json();
  msg.textContent = data.mensagem || "";
  if (data.sucesso) { document.getElementById("candidatoBatismoMatricula").value = ""; carregarCandidatosBatismo(); }
}

function badgeAptidaoBatismo(item) {
  return `<span title="${escaparHtmlEbd(item.detalhe)}">${item.ok ? "✅" : "⚠️"}</span>`;
}

async function carregarCandidatosBatismo() {
  const container = document.getElementById("resultadoListaCandidatosBatismo");
  const res = await fetchProtegido(`${API_BASE}/candidatos-batismo`);
  const candidatos = await jsonDaTela(res, container, "lista");
  if (candidatos === null) return;
  if (!Array.isArray(candidatos) || candidatos.length === 0) {
    container.innerHTML = "<p class='subtitle'>Nenhum candidato inscrito ainda.</p>";
    return;
  }
  container.innerHTML = `<table class="tabela-frequencia"><thead><tr>
    <th>Nome</th><th>Idade</th><th>Certidão civil</th><th>Parecer</th><th>Discipulado</th><th>Estatuto</th><th>Status</th><th></th>
  </tr></thead><tbody>` + candidatos.map(c => `
    <tr>
      <td>${escaparHtmlEbd(c.nome)}</td>
      <td>${badgeAptidaoBatismo(c.aptidao.itens.idadeMinima)}</td>
      <td>${badgeAptidaoBatismo(c.aptidao.itens.certidaoCivil)}</td>
      <td>${badgeAptidaoBatismo(c.aptidao.itens.parecerVidaPregressa)} <button class="btn-link" data-on-click="parecerCandidatoBatismoAcao" data-args-click="${argsAttr(c.candidatoId)}">Dar parecer</button></td>
      <td>${badgeAptidaoBatismo(c.aptidao.itens.discipulado)} <button class="btn-link" data-on-click="alternarDiscipuladoBatismoAcao" data-args-click="${argsAttr(c.candidatoId, !c.discipuladoConcluidoManual)}">${c.discipuladoConcluidoManual ? "Desmarcar" : "Marcar concluído"}</button></td>
      <td>${c.aceiteTermoAssinadoId ? "✅" : `<button class="btn-link" data-on-click="acaoCandidatoBatismo" data-args-click="${argsAttr(c.candidatoId, "ACEITAR_ESTATUTO")}">Registrar aceite</button>`}</td>
      <td>${escaparHtmlEbd(c.status)}</td>
      <td class="acoes-inline">
        ${c.status === "AGUARDANDO_TURMA" ? `<button class="btn-link" data-on-click="atribuirTurmaBatismoAcao" data-args-click="${argsAttr(c.candidatoId)}">Atribuir turma</button>` : ""}
        ${c.turmaId && c.status === "AGUARDANDO_TURMA" ? `
          <button class="btn-link" data-on-click="acaoCandidatoBatismo" data-args-click="${argsAttr(c.candidatoId, "APROVAR")}">Aprovar</button>
          <button class="btn-link btn-link-perigo" data-on-click="reprovarCandidatoBatismoAcao" data-args-click="${argsAttr(c.candidatoId)}">Reprovar</button>
        ` : ""}
      </td>
    </tr>
  `).join("") + "</tbody></table>";
}

async function acaoCandidatoBatismo(id, acao, corpoExtra) {
  const res = await fetchProtegido(`${API_BASE}/candidatos-batismo/${id}`, {
    method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(Object.assign({ acao }, corpoExtra))
  });
  const data = await res.json();
  avisarResultado(data);
  if (data.sucesso) carregarCandidatosBatismo();
}

async function parecerCandidatoBatismoAcao(id) {
  const favoravel = await confirmarAcao("O parecer de vida pregressa é favorável? (Cancelar = desfavorável)", "Favorável");
  const observacao = await pedirTexto("Observação do parecer (opcional)", "");
  await acaoCandidatoBatismo(id, "PARECER", { parecerVidaPregressa: favoravel ? "FAVORAVEL" : "DESFAVORAVEL", observacao });
}

async function alternarDiscipuladoBatismoAcao(id, concluido) {
  await acaoCandidatoBatismo(id, "DISCIPULADO_CONCLUIDO", { concluido });
}

async function atribuirTurmaBatismoAcao(id) {
  const turmaId = await pedirTexto("Id da turma (veja a tabela de Turmas de Batismo acima)", "Ex: 3");
  if (!turmaId) return;
  await acaoCandidatoBatismo(id, "ATRIBUIR_TURMA", { turmaId: Number(turmaId) });
}

async function reprovarCandidatoBatismoAcao(id) {
  const motivo = await pedirTexto("Motivo da reprovação (obrigatório)", "");
  if (!motivo) return;
  await acaoCandidatoBatismo(id, "REPROVAR", { motivo });
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

// ---- SECRETARIA / ABA PROCESSO DISCIPLINAR ----
// v3.2: abrir (com catálogo de infrações) + rito (relator, citação, afastamento
// cautelar, defesa/revelia, defensor) + julgar + ajustar prazo.
// v3.6 — escada territorial: o select de órgão junta os 5 órgãos centrais
// (Orgaos) com as JAI/JEA/TER territoriais cadastradas em OrgaosLocais. O
// value carrega um prefixo (central:ID / local:ID) que salvarProcessoDisciplinar()
// decompõe em orgaoResponsavelId/orgaoLocalId.
async function carregarOpcoesFormDisciplina() {
  const res = await fetchProtegido(`${API_BASE}/orgaos`);
  const orgaos = await res.json();
  const locaisRes = await fetchProtegido(`${API_BASE}/catalogos/orgaosLocais`);
  const locais = (await listaDaApi(locaisRes)).filter(o => o.ativo !== false && ["JAI", "JEA", "TER"].includes(o.sigla));
  document.getElementById("disciplinaOrgao").innerHTML =
    // órgão central (CEI/CLI...) só o geral escolhe (AbrirProcessoDisciplinar recusa os demais); o local exige vínculo com o órgão, conferido no servidor
    (authGeral ? orgaos : []).map(o => `<option value="central:${o.orgaoId}">${escaparHtmlEbd(o.sigla)}</option>`).join("") +
    locais.map(o => `<option value="local:${o.orgaoLocalId}">${escaparHtmlEbd(o.sigla)} — ${escaparHtmlEbd(o.nome)}</option>`).join("");

  const infRes = await fetchProtegido(`${API_BASE}/catalogos/tiposInfracao`);
  const infracoes = await infRes.json();
  window._catalogoInfracoes = Array.isArray(infracoes) ? infracoes : [];
  const lista = document.getElementById("listaInfracoesAbertura");
  lista.innerHTML = window._catalogoInfracoes
    .filter(i => i.ativo !== false)
    .map(i => `<label style="display:block;"><input type="checkbox" class="chk-infracao-abertura" value="${i.infracaoId}" style="width:auto;" /> ${escaparHtmlEbd(i.nome)} <span class="subtitle">(${escaparHtmlEbd(i.referenciaRegimento) || escaparHtmlEbd(i.codigo)} — ${badgeGravidade(i.gravidade)})</span></label>`)
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
  return `<span class="badge-status ${CORES_GRAVIDADE[gravidade] || ""}">${ROTULO_GRAVIDADE[gravidade] || escaparHtmlEbd(gravidade)}</span>`;
}

function badgeSituacaoDisciplina(situacao) {
  const cores = {
    EM_ANDAMENTO: "badge-licenca", AFASTAMENTO_CAUTELAR: "badge-licenca", EM_RECURSO: "badge-licenca", CUMPRINDO_SANCAO: "badge-licenca", PRAZO_INDETERMINADO: "badge-licenca",
    CUMPRIDO: "badge-ativo", ARQUIVADO: "badge-ativo", EXCLUIDO: "badge-desligado"
  };
  return `<span class="badge-status ${cores[situacao] || ""}">${ROTULO_SITUACAO_DISCIPLINA[situacao] || escaparHtmlEbd(situacao)}</span>`;
}

async function carregarProcessosDisciplinares() {
  const container = document.getElementById("resultadoListaDisciplina");
  const res = await fetchProtegido(`${API_BASE}/processos-disciplinares`);
  const processos = await jsonDaTela(res, container, "objeto");
  if (processos === null) return;

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
      ? `<span class="subtitle">🔒 Sigiloso — ${escaparHtmlEbd(p.quantidadeInfracoes ?? "?")} infração(ões), detalhes restritos ao CEI/relator</span>`
      : (() => {
          const maisGrave = (p.infracoes || []).reduce((atual, i) => {
            if (!i.gravidade) return atual;
            return !atual || ORDEM_GRAVIDADE.indexOf(i.gravidade) > ORDEM_GRAVIDADE.indexOf(atual) ? i.gravidade : atual;
          }, null);
          const texto = (p.infracoes || []).map(i => i.nome).join(", ") || "-";
          return texto === "-" ? "-" : `${escaparHtmlEbd(texto)} ${badgeGravidade(maisGrave)}`;
        })();
    const citacaoTexto = p.dataCitacao ? `${escaparHtmlEbd(p.dataCitacao)} (${ROTULO_CANAL_CITACAO[p.canalCitacao] || escaparHtmlEbd(p.canalCitacao)})` : "-";
    const defesaTexto = p.defesaProtocolada
      ? `Protocolada em ${escaparHtmlEbd(p.dataDefesa)}`
      : (p.prazoDefesa && p.prazoDefesa.emRevelia ? "<span class='badge-status badge-desligado'>Revelia</span>" : (p.dataCitacao ? "Aguardando" : "-"));
    const podeRegistrarProva = p.emCarenciaAdministrativa;
    const podeRecorrer = p.podeRecorrer && !p.prazoRecursoVencido;
    const podeHomologar = p.homologadoPeloCei === false && authPermissoes.includes("cei");
    let penalidadeTexto = escaparHtmlEbd(p.penalidadeNome) || "-";
    if (p.emCarenciaAdministrativa) penalidadeTexto += "<br /><span class='badge-status badge-licenca'>Em Carência Administrativa</span>";
    else if (p.resultadoProvaReintegracao) penalidadeTexto += `<br /><span class="subtitle">Prova de Reintegração: ${escaparHtmlEbd(p.resultadoProvaReintegracao)}</span>`;
    if (p.homologadoPeloCei === false) penalidadeTexto += "<br /><span class='badge-status badge-licenca'>Aguardando homologação do CEI</span>";
    else if (p.homologadoPeloCei === true) penalidadeTexto += "<br /><span class='subtitle'>Homologado pelo CEI</span>";
    html += `<tr>
      <td>${escaparHtmlEbd(p.nome)}${p.sigiloso ? " 🔒" : ""}${p.defensorNome ? `<br /><span class="subtitle">Defensor: ${escaparHtmlEbd(p.defensorNome)}</span>` : ""}
        ${p.envolveMinistro ? `<br /><span class="subtitle">⚠️ Envolve ministro — jurisdição dupla (também CIADSETA-PARÁ, fora do sistema), Art. 103 §1º, II</span>` : ""}</td>
      <td>${escaparHtmlEbd(p.orgaoSigla)}${p.orgaoLocalId ? `<br /><span class="subtitle">${escaparHtmlEbd(p.orgaoNome)}</span>` : ""}</td>
      <td>${infracoesTexto}</td>
      <td>${escaparHtmlEbd(p.relatorNome) || "-"}</td>
      <td>${citacaoTexto}</td>
      <td>${defesaTexto}</td>
      <td>${penalidadeTexto}</td>
      <td>${badgeSituacaoDisciplina(p.situacaoEfetiva)}</td>
      <td>${escaparHtmlEbd(p.diasRestantes ?? "-")}</td>
      <td class="acoes-inline">
        ${p.status !== "JULGADO" ? `<button class="btn-link" data-on-click="designarRelatorAcao" data-args-click="${argsAttr(p.processoId)}">Relator</button>` : ""}
        ${p.status !== "JULGADO" && !p.dataCitacao ? `<button class="btn-link" data-on-click="citarAcao" data-args-click="${argsAttr(p.processoId)}">Citar</button>` : ""}
        ${podeAfastar ? `<button class="btn-link" data-on-click="afastarCautelarAcao" data-args-click="${argsAttr(p.processoId)}">Afastar</button>` : ""}
        ${p.status !== "JULGADO" && p.dataCitacao && !p.defesaProtocolada ? `<button class="btn-link" data-on-click="registrarDefesaAcao" data-args-click="${argsAttr(p.processoId)}">Registrar Defesa</button>` : ""}
        ${p.status !== "JULGADO" ? `<button class="btn-link" data-on-click="designarDefensorAcao" data-args-click="${argsAttr(p.processoId)}">Defensor</button>` : ""}
        ${podeJulgar ? `<button class="btn-link" data-on-click="julgarProcessoAcao" data-args-click="${argsAttr(p.processoId)}">Julgar</button>` : ""}
        ${podeAjustarPrazo ? `<button class="btn-link" data-on-click="ajustarPrazoProcessoAcao" data-args-click="${argsAttr(p.processoId)}">Ajustar Prazo</button>` : ""}
        ${podeRegistrarProva ? `<button class="btn-link" data-on-click="registrarProvaReintegracaoAcao" data-args-click="${argsAttr(p.processoId)}">Prova de Reintegração</button>` : ""}
        ${podeRecorrer ? `<button class="btn-link" data-on-click="recorrerAcao" data-args-click="${argsAttr(p.processoId)}">Recorrer</button>` : ""}
        ${podeHomologar ? `<button class="btn-link" data-on-click="homologarExclusaoAcao" data-args-click="${argsAttr(p.processoId)}">Homologar</button>` : ""}
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
    const orgaosRes = await fetchProtegido(`${API_BASE}/orgaos`);
    const orgaos = await listaDaApi(orgaosRes);
    const locaisRes = await fetchProtegido(`${API_BASE}/catalogos/orgaosLocais`);
    const locais = (await listaDaApi(locaisRes)).filter(o => o.ativo !== false && ["JEA", "TER"].includes(o.sigla));
    const caixa = document.getElementById("modalCaixa");
    caixa.innerHTML = `
      <h3>Recorrer para instância superior</h3>
      <div class="input-group">
        <label>Destino:</label>
        <select id="modalOrgaoDestino">
          ${orgaos.map(o => `<option value="central:${o.orgaoId}">${escaparHtmlEbd(o.sigla)}</option>`).join("")}
          ${locais.map(o => `<option value="local:${o.orgaoLocalId}">${escaparHtmlEbd(o.sigla)} — ${escaparHtmlEbd(o.nome)}</option>`).join("")}
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
  const penRes = await fetchProtegido(`${API_BASE}/catalogos/tiposPenalidade`);
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
        <select id="modalPenalidade">${penalidades.map(p => `<option value="${p.penalidadeId}">${escaparHtmlEbd(p.nome)}</option>`).join("")}</select>
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
  const membros = await jsonDaTela(res, container, "lista");
  if (membros === null) return;

  if (!Array.isArray(membros) || membros.length === 0) {
    container.innerHTML = "<p class='subtitle'>Nenhum membro Sem Comunhão com Data de Afastamento lançada.</p>";
    return;
  }

  container.innerHTML = `<table class="tabela-frequencia"><thead><tr>
    <th>Nome</th><th>Congregação</th><th>Afastado desde</th><th>Dias</th><th></th>
  </tr></thead><tbody>` +
    membros.map(m => `<tr>
      <td>${escaparHtmlEbd(m.nome)}</td>
      <td>${escaparHtmlEbd(m.congregacao) || "-"}</td>
      <td>${escaparHtmlEbd(m.dataAfastamento) || "-"}</td>
      <td>${escaparHtmlEbd(m.diasAfastado ?? "-")}</td>
      <td class="acoes-inline">${m.elegivel ? `<button class="btn-link" data-on-click="abrirProcedimentoAbandonoAcao" data-args-click="${argsAttr(m.membroId, "MATERIAL")}">Abrir Procedimento</button>` : "aguardando 90 dias"}</td>
    </tr>`).join("") + "</tbody></table>";
}

const ROTULO_TIPO_ABANDONO = { MATERIAL: "Material", DIGITAL: "Digital" };

// Fecho 03/10/2026: no Digital, abrir o procedimento É a notificação final (Estatuto Art. 12 §2º) — quem abre escolhe o canal oficial pelo qual está notificando,
// e o prazo de 15 dias conta de hoje. Promise<number|null>: o canal escolhido, ou null se cancelou.
async function escolherCanalNotificacaoFinal() {
  let canais = [];
  try {
    const res = await fetchProtegido(`${API_BASE}/canais/para-contato`);
    const data = await res.json();
    if (data && data.sucesso !== false && Array.isArray(data.canais)) canais = data.canais;
  } catch { /* sem a lista não há como notificar */ }
  if (!canais.length) { mostrarToast("Nenhum canal institucional de contato cadastrado: cadastre um em Canais antes de abrir o procedimento Digital.", "erro"); return null; }
  return new Promise(resolve => {
    const caixa = document.getElementById("modalCaixa");
    caixa.innerHTML = `
      <h3>Notificação final (Abandono Digital)</h3>
      <p class="subtitle">Abrir o procedimento registra hoje a notificação final pelo canal escolhido (Estatuto Art. 12 §2º). Envie a mensagem ao membro por esse canal: o prazo de defesa de 15 dias conta a partir de hoje.</p>
      <select id="modalCanalNotificacao">${canais.map(c => `<option value="${Number(c.canalId)}">${escaparHtmlEbd(c.nome)}${c.identificador ? ` — ${escaparHtmlEbd(c.identificador)}` : ""}</option>`).join("")}</select>
      <div class="modal-acoes">
        <button class="btn-confirmar btn-secundario" id="modalCancelar">Cancelar</button>
        <button class="btn-confirmar btn-perigo" id="modalConfirmar">Notificar e abrir</button>
      </div>`;
    document.getElementById("modalOverlay").classList.remove("escondido");
    document.getElementById("modalConfirmar").onclick = () => { const v = Number(document.getElementById("modalCanalNotificacao").value); fecharModal(); resolve(v || null); };
    document.getElementById("modalCancelar").onclick = () => { fecharModal(); resolve(null); };
  });
}

async function abrirProcedimentoAbandonoAcao(membroId, tipo) {
  tipo = tipo || "MATERIAL";
  const rotulo = ROTULO_TIPO_ABANDONO[tipo] || tipo;
  let canalNotificacaoId = null;
  if (tipo === "DIGITAL") {
    canalNotificacaoId = await escolherCanalNotificacaoFinal();
    if (!canalNotificacaoId) return;
  } else if (!(await confirmarAcao(`Abrir o procedimento sumário de constatação de Abandono ${rotulo} para este membro? Ele passa a contar o prazo de defesa de 15 dias. A homologação será de outra pessoa do nível geral.`, "Abrir Procedimento"))) return;
  const res = await fetchProtegido(`${API_BASE}/procedimentos-abandono`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ membroId, tipo, canalNotificacaoId })
  });
  const data = await res.json();
  avisarResultado(data);
  if (data.sucesso) { carregarRadarAbandono(); carregarRadarAbandonoDigital(); carregarProcedimentosAbandono(); }
}

const ROTULO_STATUS_ABANDONO = { NOTIFICADO: "Notificado (em prazo de defesa)", HOMOLOGADO: "Homologado (perda efetivada)", ARQUIVADO: "Arquivado" };
function badgeStatusAbandono(status) {
  const cores = { NOTIFICADO: "badge-licenca", HOMOLOGADO: "badge-desligado", ARQUIVADO: "badge-ativo" };
  return `<span class="badge-status ${cores[status] || ""}">${ROTULO_STATUS_ABANDONO[status] || escaparHtmlEbd(status)}</span>`;
}

async function carregarProcedimentosAbandono() {
  const container = document.getElementById("resultadoListaAbandono");
  const res = await fetchProtegido(`${API_BASE}/procedimentos-abandono`);
  const procedimentos = await jsonDaTela(res, container, "lista");
  if (procedimentos === null) return;

  if (!Array.isArray(procedimentos) || procedimentos.length === 0) {
    container.innerHTML = "<p class='subtitle'>Nenhum procedimento aberto.</p>";
    return;
  }

  container.innerHTML = `<table class="tabela-frequencia"><thead><tr>
    <th>Nome</th><th>Tipo</th><th>Status</th><th>Notificado em</th><th>Aberto por</th><th>Recurso</th><th></th>
  </tr></thead><tbody>` +
    procedimentos.map(p => `<tr>
      <td>${escaparHtmlEbd(p.nome)}</td>
      <td>${ROTULO_TIPO_ABANDONO[p.tipo] || escaparHtmlEbd(p.tipo)}</td>
      <td>${badgeStatusAbandono(p.status)}${p.status === "NOTIFICADO" ? (p.prazoVencido ? " ⏰ prazo vencido" : (p.prazoVenceEm ? ` (defesa até ${escaparHtmlEbd(p.prazoVenceEm)})` : "")) : ""}</td>
      <td>${escaparHtmlEbd(p.dataNotificacao) || "-"}</td>
      <td>${p.abertoPorNome ? escaparHtmlEbd(p.abertoPorNome) : "-"}</td>
      <td>${p.recursoInterposto ? `${escaparHtmlEbd(p.resultadoRecurso) || "PENDENTE"} (${escaparHtmlEbd(p.dataRecurso) || "-"})` : "-"}</td>
      <td class="acoes-inline">
        ${authGeral && p.status === "NOTIFICADO" && !p.abertoPorMim ? `<button class="btn-link" data-on-click="homologarProcedimentoAbandonoAcao" data-args-click="${argsAttr(p.procedimentoId)}">Homologar</button>` : ""}
        ${authGeral && p.status === "NOTIFICADO" && p.abertoPorMim ? `<span class="subtitle" title="Regra dos dois olhos">homologação: outra pessoa</span>` : ""}
        ${p.status === "NOTIFICADO" ? `<button class="btn-link" data-on-click="arquivarProcedimentoAbandonoAcao" data-args-click="${argsAttr(p.procedimentoId)}">Arquivar</button>` : ""}
        ${authGeral && p.status === "HOMOLOGADO" && !p.recursoInterposto ? `<button class="btn-link" data-on-click="registrarRecursoAbandonoAcao" data-args-click="${argsAttr(p.procedimentoId)}">Registrar Recurso</button>` : ""}
      </td>
    </tr>`).join("") + "</tbody></table>";
}

// ---- Abandono Digital (Art. 12 §2º): canais + tentativas de contato + radar próprio ----
// v7.3: os canais vêm de /api/canais/para-contato (login) — só os que valem como tentativa de contato
// individual institucional (e-mail, telefone/WhatsApp institucional, o próprio sistema); grupo e rede social não entram.
async function carregarOpcoesTentativaContato() {
  const select = document.getElementById("tentativaCanal");
  if (!select) return;
  let canais = [];
  try {
    const res = await fetchProtegido(`${API_BASE}/canais/para-contato`);
    const data = await res.json();
    if (data && data.sucesso !== false && Array.isArray(data.canais)) canais = data.canais;
  } catch { /* sem a lista, o seletor fica vazio e a tentativa não é registrada sem canal */ }
  select.innerHTML = canais.length
    ? canais.map(c => `<option value="${Number(c.canalId)}">${escaparHtmlEbd(c.nome)}${c.identificador ? ` — ${escaparHtmlEbd(c.identificador)}` : ""}${c.cadastroIncompleto ? " (cadastro incompleto)" : ""}</option>`).join("")
    : `<option value="">— nenhum canal institucional de contato cadastrado —</option>`;
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
  const data = await jsonDaTela(res, container, "objeto");
  if (data === null) return;
  const tentativas = data.tentativas || [];
  const e = data.elegibilidade || {};

  const resumo = `<p class="subtitle">${escaparHtmlEbd(e.canaisDistintos ?? 0)}/2 canais distintos` +
    (e.diasDesdePrimeira != null ? `, ${escaparHtmlEbd(e.diasDesdePrimeira)}/90 dias desde a 1ª tentativa` : "") +
    ` — ${e.elegivel ? "✅ elegível para abrir o procedimento" : "ainda não elegível"}.</p>`;

  if (tentativas.length === 0) {
    container.innerHTML = resumo + "<p class='subtitle'>Nenhuma tentativa registrada para esta matrícula.</p>";
    return;
  }

  container.innerHTML = resumo + `<table class="tabela-frequencia"><thead><tr>
    <th>Canal</th><th>Data</th><th>Observação</th>
  </tr></thead><tbody>` +
    tentativas.map(t => `<tr><td>${escaparHtmlEbd(t.canal)}</td><td>${escaparHtmlEbd(t.dataTentativa)}</td><td>${escaparHtmlEbd(t.observacao) || "-"}</td></tr>`).join("") + "</tbody></table>";
}

async function carregarRadarAbandonoDigital() {
  const container = document.getElementById("resultadoRadarAbandonoDigital");
  if (!container) return;
  const res = await fetchProtegido(`${API_BASE}/radar-abandono-digital`);
  const membros = await jsonDaTela(res, container, "lista");
  if (membros === null) return;

  if (!Array.isArray(membros) || membros.length === 0) {
    container.innerHTML = "<p class='subtitle'>Nenhum membro com tentativa de contato registrada.</p>";
    return;
  }

  container.innerHTML = `<table class="tabela-frequencia"><thead><tr>
    <th>Nome</th><th>Congregação</th><th>Canais distintos</th><th>Dias desde a 1ª tentativa</th><th></th>
  </tr></thead><tbody>` +
    membros.map(m => `<tr>
      <td>${escaparHtmlEbd(m.nome)}</td>
      <td>${escaparHtmlEbd(m.congregacao) || "-"}</td>
      <td>${escaparHtmlEbd(m.canaisDistintos)}/2</td>
      <td>${escaparHtmlEbd(m.diasDesdePrimeira ?? "-")}</td>
      <td class="acoes-inline">${m.elegivel ? `<button class="btn-link" data-on-click="abrirProcedimentoAbandonoAcao" data-args-click="${argsAttr(m.membroId, "DIGITAL")}">Abrir Procedimento</button>` : "requisitos incompletos"}</td>
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

// ---- DOAÇÕES E PROGRAMA DE INTEGRIDADE (v4.22) ----
async function registrarDoacaoAcao() {
  const body = {
    congregacaoId: document.getElementById("doacaoCongregacao").value || null,
    valor: document.getElementById("doacaoValor").value,
    formaPagamento: document.getElementById("doacaoFormaPagamento").value,
    dataRecebimento: document.getElementById("doacaoData").value,
    doadorNome: document.getElementById("doacaoDoadorNome").value || null,
    doadorCpfCnpj: document.getElementById("doacaoDoadorCpfCnpj").value || null
  };
  const res = await fetchProtegido(`${API_BASE}/doacoes`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const d = await res.json();
  alert(d.mensagem);
  if (d.sucesso) {
    document.getElementById("doacaoValor").value = "";
    document.getElementById("doacaoDoadorNome").value = "";
    document.getElementById("doacaoDoadorCpfCnpj").value = "";
    carregarDoacoesAcao();
    carregarSinalizacoesNifAcao();
  }
}

async function carregarDoacoesAcao() {
  const container = document.getElementById("resultadoDoacoes");
  const res = await fetchProtegido(`${API_BASE}/doacoes`);
  const lista = await jsonDaTela(res, container, "lista");
  if (lista === null) return;
  if (!Array.isArray(lista) || lista.length === 0) {
    container.innerHTML = "<p class='subtitle'>Nenhuma doação registrada.</p>";
    return;
  }
  let html = `<table class="tabela-frequencia"><thead><tr><th>Recibo</th><th>Data</th><th>Valor</th><th>Forma</th><th>Doador</th></tr></thead><tbody>`;
  lista.forEach(d => {
    const doador = d.identificacaoObrigatoria ? `${escaparHtmlEbd(d.doadorNome) || "⚠️ não identificado"} (${escaparHtmlEbd(d.doadorCpfCnpj) || "-"})` : (d.doadorNome || "-");
    html += `<tr><td>${escaparHtmlEbd(d.numeroRecibo)}</td><td>${escaparHtmlEbd(d.dataRecebimento)}</td><td>R$ ${Number(d.valor).toFixed(2)}</td><td>${escaparHtmlEbd(d.formaPagamento)}</td><td>${escaparHtmlEbd(doador)}</td></tr>`;
  });
  html += "</tbody></table>";
  container.innerHTML = html;
}

async function registrarPoliticaAcao() {
  const body = {
    tipo: document.getElementById("politicaTipo").value,
    titulo: document.getElementById("politicaTitulo").value,
    ataReferencia: document.getElementById("politicaAta").value,
    dataAprovacao: document.getElementById("politicaData").value
  };
  const res = await fetchProtegido(`${API_BASE}/integridade/politicas`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const d = await res.json();
  alert(d.mensagem);
  if (d.sucesso) { document.getElementById("politicaTitulo").value = ""; document.getElementById("politicaAta").value = ""; carregarPoliticasAcao(); }
}

async function carregarPoliticasAcao() {
  const container = document.getElementById("resultadoPoliticas");
  const res = await fetchProtegido(`${API_BASE}/integridade/politicas`);
  const lista = await jsonDaTela(res, container, "lista");
  if (lista === null) return;
  if (!Array.isArray(lista) || lista.length === 0) {
    container.innerHTML = "<p class='subtitle'>Nenhuma política aprovada ainda.</p>";
    return;
  }
  let html = `<table class="tabela-frequencia"><thead><tr><th>Id</th><th>Tipo</th><th>Título</th><th>Ata</th><th>Aprovação</th><th>Vigente</th></tr></thead><tbody>`;
  lista.forEach(p => html += `<tr><td>${p.PoliticaId}</td><td>${escaparHtmlEbd(p.Tipo)}</td><td>${escaparHtmlEbd(p.Titulo)}</td><td>${escaparHtmlEbd(p.AtaReferencia)}</td><td>${escaparHtmlEbd(p.DataAprovacao)}</td><td>${p.Vigente ? "✅" : "-"}</td></tr>`);
  html += "</tbody></table>";
  container.innerHTML = html;
}

async function registrarAceiteAcao() {
  const body = { membroId: document.getElementById("aceiteMembroId").value, politicaId: document.getElementById("aceitePoliticaId").value };
  const res = await fetchProtegido(`${API_BASE}/integridade/aceites`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const d = await res.json();
  alert(d.mensagem);
  if (d.sucesso) {
    document.getElementById("aceiteMembroId").value = "";
    document.getElementById("aceitePoliticaId").value = "";
    const res2 = await fetchProtegido(`${API_BASE}/integridade/aceites`);
    const lista = await res2.json();
    const container = document.getElementById("resultadoAceites");
    let html = `<table class="tabela-frequencia"><thead><tr><th>Membro</th><th>Política</th><th>Data</th></tr></thead><tbody>`;
    (Array.isArray(lista) ? lista : []).forEach(a => html += `<tr><td>${escaparHtmlEbd(a.membroNome)}</td><td>${escaparHtmlEbd(a.politicaTitulo)}</td><td>${new Date(a.DataAceite).toLocaleString("pt-BR")}</td></tr>`);
    html += "</tbody></table>";
    container.innerHTML = html;
  }
}

async function carregarDueDiligenceAcao() {
  const container = document.getElementById("resultadoDueDiligence");
  const res = await fetchProtegido(`${API_BASE}/integridade/due-diligence`);
  const lista = await jsonDaTela(res, container, "lista");
  if (lista === null) return;
  if (!Array.isArray(lista) || lista.length === 0) {
    container.innerHTML = "<p class='subtitle'>Nenhum fornecedor cadastrado.</p>";
    return;
  }
  const cores = { APROVADO: "✅", REPROVADO: "⛔", PENDENTE: "⏳" };
  let html = `<table class="tabela-frequencia"><thead><tr><th>Fornecedor</th><th>Status</th><th>Observação</th><th>Ação</th></tr></thead><tbody>`;
  lista.forEach(f => {
    html += `<tr><td>${escaparHtmlEbd(f.fornecedorNome)}</td><td>${cores[f.Status] || "⏳"} ${escaparHtmlEbd(f.Status) || "PENDENTE"}</td><td>${escaparHtmlEbd(f.Observacao) || "-"}</td>
      <td>
        <button class="btn-confirmar" style="width:auto;padding:4px 8px;" data-on-click="registrarDueDiligenceAcao" data-args-click="${argsAttr(f.FornecedorId, "APROVADO")}">Aprovar</button>
        <button class="btn-confirmar" style="width:auto;padding:4px 8px;" data-on-click="registrarDueDiligenceAcao" data-args-click="${argsAttr(f.FornecedorId, "REPROVADO")}">Reprovar</button>
      </td></tr>`;
  });
  html += "</tbody></table>";
  container.innerHTML = html;
}

async function registrarDueDiligenceAcao(fornecedorId, status) {
  const observacao = prompt(`Observação da due diligence (${status}):`, "") || null;
  const res = await fetchProtegido(`${API_BASE}/integridade/due-diligence`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ fornecedorId, status, observacao }) });
  const d = await res.json();
  alert(d.mensagem);
  if (d.sucesso) carregarDueDiligenceAcao();
}

async function registrarConflitoInteresseAcao() {
  const body = {
    membroId: document.getElementById("conflitoMembroId").value,
    mandatoReferencia: document.getElementById("conflitoMandato").value,
    temConflito: document.getElementById("conflitoTem").value === "1",
    descricaoConflito: document.getElementById("conflitoDescricao").value || null
  };
  const res = await fetchProtegido(`${API_BASE}/integridade/conflitos-interesse`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const d = await res.json();
  alert(d.mensagem);
  if (d.sucesso) {
    document.getElementById("conflitoMembroId").value = "";
    document.getElementById("conflitoMandato").value = "";
    document.getElementById("conflitoDescricao").value = "";
    carregarConflitosInteresseAcao();
  }
}

async function carregarConflitosInteresseAcao() {
  const container = document.getElementById("resultadoConflitosInteresse");
  const res = await fetchProtegido(`${API_BASE}/integridade/conflitos-interesse`);
  const lista = await jsonDaTela(res, container, "lista");
  if (lista === null) return;
  if (!Array.isArray(lista) || lista.length === 0) {
    container.innerHTML = "<p class='subtitle'>Nenhuma declaração registrada.</p>";
    return;
  }
  let html = `<table class="tabela-frequencia"><thead><tr><th>Dirigente</th><th>Mandato</th><th>Conflito?</th><th>Descrição</th></tr></thead><tbody>`;
  lista.forEach(c => html += `<tr><td>${escaparHtmlEbd(c.membroNome)}</td><td>${escaparHtmlEbd(c.MandatoReferencia)}</td><td>${c.TemConflito ? "⚠️ Sim" : "✅ Não"}</td><td>${escaparHtmlEbd(c.DescricaoConflito) || "-"}</td></tr>`);
  html += "</tbody></table>";
  container.innerHTML = html;
}

// ==================== ABA: PROTEÇÃO DE DADOS (Encarregado de Dados) ====================
async function carregarSolicitacoesDPO() {
  const status = document.getElementById("dpoFiltroStatus").value;
  const params = new URLSearchParams();
  if (status) params.set("status", status);

  const res = await fetchProtegido(`${API_BASE}/lgpd/dpo/solicitacoes?${params.toString()}`);
  const container = document.getElementById("resultadoListaSolicitacoesDPO");
  const registros = await jsonDaTela(res, container, "lista");
  if (registros === null) return;
  if (!Array.isArray(registros) || registros.length === 0) {
    container.innerHTML = "<p class='subtitle'>Nenhuma solicitação encontrada.</p>";
    return;
  }
  let html = "<table class='tabela-frequencia'><thead><tr><th>Matrícula</th><th>Nome</th><th>Tipo</th><th>Descrição</th><th>Status</th><th>Data</th><th>Ações</th></tr></thead><tbody>";
  registros.forEach(s => {
    let acoes = "";
    if (s.status === "PENDENTE" || s.status === "EM_ANALISE") {
      if (s.tipo === "EXCLUSAO") {
        acoes = `<button class="btn-link" data-on-click="responderSolicitacaoDPO" data-args-click="${argsAttr(s.solicitacaoId, "EM_ANALISE")}">Em análise</button>
                 <button class="btn-link" data-on-click="executarExclusaoDPO" data-args-click="${argsAttr(s.solicitacaoId)}">Executar exclusão</button>
                 <button class="btn-link btn-link-perigo" data-on-click="responderSolicitacaoDPO" data-args-click="${argsAttr(s.solicitacaoId, "NEGADA")}">Negar</button>`;
      } else {
        acoes = `<button class="btn-link" data-on-click="responderSolicitacaoDPO" data-args-click="${argsAttr(s.solicitacaoId, "EM_ANALISE")}">Em análise</button>
                 <button class="btn-link" data-on-click="responderSolicitacaoDPO" data-args-click="${argsAttr(s.solicitacaoId, "ATENDIDA")}">Atender</button>
                 <button class="btn-link btn-link-perigo" data-on-click="responderSolicitacaoDPO" data-args-click="${argsAttr(s.solicitacaoId, "NEGADA")}">Negar</button>`;
      }
    }
    html += `<tr>
      <td>${s.membroId}</td>
      <td>${escaparHtmlEbd(s.nome)}</td>
      <td>${escaparHtmlEbd(s.tipo)}</td>
      <td>${escaparHtmlEbd(s.descricao) || "-"}</td>
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

// ---- ESCALAS DE SERVIÇO (v5.6 — auto-escalador) ----
let _esCongregacaoAtual = null;

async function carregarOpcoesEscalasAcao() {
  const selCong = document.getElementById("esCongregacao");
  if (!selCong.dataset.montado) {
    const congs = await listaDaApi(fetchProtegido(`${API_BASE}/catalogos/congregacoes`));
    selCong.innerHTML = congs.filter(c => c.ativa !== false).map(c => `<option value="${c.congregacaoId}">${escaparHtmlEbd(c.nome)}</option>`).join("");
    selCong.dataset.montado = "1";
  }
}

async function criarEquipeAcao() {
  const nome = document.getElementById("esNovaEquipeNome").value.trim();
  const congregacaoId = document.getElementById("esCongregacao").value;
  const liderMembroId = document.getElementById("esNovaEquipeLider").value;
  const msg = document.getElementById("resultadoEscalasEquipes");
  if (!nome || !congregacaoId || !liderMembroId) { msg.textContent = "Informe nome, congregação e matrícula do líder."; return; }
  const res = await fetchProtegido(`${API_BASE}/escalas/equipes`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ nome, congregacaoId: Number(congregacaoId), liderMembroId: Number(liderMembroId) })
  });
  const data = await res.json();
  if (data.sucesso === false) { mostrarToast(data.mensagem, "erro"); return; }
  mostrarToast("✅ Equipe criada.", "sucesso");
  document.getElementById("esNovaEquipeNome").value = "";
  document.getElementById("esNovaEquipeLider").value = "";
  carregarEquipesAcao();
}

async function carregarEquipesAcao() {
  const congregacaoId = document.getElementById("esCongregacao").value;
  if (!congregacaoId) return;
  _esCongregacaoAtual = congregacaoId;
  const res = await fetchProtegido(`${API_BASE}/escalas/equipes?congregacaoId=${congregacaoId}`);
  const data = await res.json();
  if (data.sucesso === false) { document.getElementById("resultadoEscalasEquipes").textContent = data.mensagem; return; }
  document.getElementById("resultadoEscalasEquipes").textContent = "";

  await volGarantirCatalogos();   // o catálogo traz as naturezas da coluna "Natureza"
  const linhas = data.equipes.map(e => `<tr><td>${escaparHtmlEbd(e.nome)}</td><td>${escaparHtmlEbd(e.liderNome)}</td><td>${e.ativa ? "Ativa" : "Inativa"}</td><td>${volCelulaNatureza(e)}</td></tr>`).join("");
  document.getElementById("painelEquipesEscala").innerHTML = data.equipes.length
    ? `<div class="rolagem-tabela"><table class="tabela-frequencia"><thead><tr><th>Equipe</th><th>Líder</th><th>Status</th><th>Natureza</th></tr></thead><tbody>${linhas}</tbody></table></div>`
    : "<p class='subtitle'>Nenhuma equipe cadastrada nesta congregação ainda.</p>";

  const opcoesEquipe = data.equipes.map(e => `<option value="${e.equipeId}">${escaparHtmlEbd(e.nome)}</option>`).join("");
  const selTrocas = document.getElementById("esEquipeTrocas");
  const selPendencias = document.getElementById("esEquipePendencias");
  if (selTrocas) selTrocas.innerHTML = opcoesEquipe;
  if (selPendencias) selPendencias.innerHTML = opcoesEquipe;

  carregarServicosAcao();
  volCarregarEscalasAcao(data.equipes);
}

async function adicionarMembroEquipeAcao() {
  const equipeId = document.getElementById("esMembroEquipeId").value;
  const membroId = document.getElementById("esMembroMatricula").value;
  const frequenciaPreferidaDias = document.getElementById("esMembroFrequencia").value || 30;
  const msg = document.getElementById("resultadoEscalasEquipes");
  if (!equipeId || !membroId) { msg.textContent = "Informe o id da equipe e a matrícula do voluntário."; return; }
  const res = await fetchProtegido(`${API_BASE}/escalas/equipes-membros`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ equipeId: Number(equipeId), membroId: Number(membroId), frequenciaPreferidaDias: Number(frequenciaPreferidaDias) })
  });
  const data = await res.json();
  if (data.sucesso === false) { mostrarToast(data.mensagem, "erro"); return; }
  mostrarToast(data.mensagem, "sucesso");
  document.getElementById("esMembroMatricula").value = "";
}

async function criarServicoAcao() {
  const congregacaoId = document.getElementById("esCongregacao").value;
  const dataHora = document.getElementById("esNovoServicoData").value;
  const descricao = document.getElementById("esNovoServicoDescricao").value.trim();
  const prazoConfirmacaoDias = document.getElementById("esNovoServicoPrazo").value || 3;
  const msg = document.getElementById("resultadoEscalasServicos");
  if (!congregacaoId || !dataHora) { msg.textContent = "Escolha a congregação e informe a data/hora."; return; }
  const res = await fetchProtegido(`${API_BASE}/escalas/servicos`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ congregacaoId: Number(congregacaoId), dataHora, descricao, prazoConfirmacaoDias: Number(prazoConfirmacaoDias) })
  });
  const data = await res.json();
  if (data.sucesso === false) { mostrarToast(data.mensagem, "erro"); return; }
  mostrarToast("✅ Serviço criado.", "sucesso");
  document.getElementById("esNovoServicoDescricao").value = "";
  carregarServicosAcao();
}

async function carregarServicosAcao() {
  if (!_esCongregacaoAtual) return;
  const res = await fetchProtegido(`${API_BASE}/escalas/servicos?congregacaoId=${_esCongregacaoAtual}`);
  const data = await res.json();
  if (data.sucesso === false) return;
  // Guarda quais serviços são de rodízio: o detalhe (servicos-detalhe) não traz essa informação.
  volServicoRodizio = {};
  data.servicos.forEach(s => { if (s.rodizioId) volServicoRodizio[s.servicoId] = s.rodizioId; });
  const linhas = data.servicos.map(s => `<tr>
    <td>${volDataHora(s.dataHora)}</td><td>${escaparHtmlEbd(s.descricao || "")}${s.rodizioId ? ' <span class="vol-etiqueta">Rodízio</span>' : ""}</td><td>${escaparHtmlEbd(s.status)}</td>
    <td><button class="btn-confirmar btn-secundario" style="width:auto;margin:0;" data-on-click="abrirServicoEscalaAcao" data-args-click="${argsAttr(Number(s.servicoId))}">🔍 Abrir</button></td>
  </tr>`).join("");
  document.getElementById("painelServicosEscala").innerHTML = data.servicos.length
    ? `<div class="rolagem-tabela"><table class="tabela-frequencia"><thead><tr><th>Data/Hora</th><th>Descrição</th><th>Status</th><th></th></tr></thead><tbody>${linhas}</tbody></table></div>`
    : "<p class='subtitle'>Nenhum serviço cadastrado ainda.</p>";
}

async function abrirServicoEscalaAcao(servicoId) {
  const res = await fetchProtegido(`${API_BASE}/escalas/servicos-detalhe?servicoId=${servicoId}`);
  const data = await res.json();
  const container = document.getElementById("painelDetalheServicoEscala");
  if (data.sucesso === false) { container.innerHTML = `<p class="subtitle">${escaparHtmlEbd(data.mensagem)}</p>`; return; }

  const ehRodizio = !!volServicoRodizio[servicoId];
  const linhasAlocacao = data.alocacoes.map(a => `<tr><td>${a.equipeId}</td><td>${a.membroId}</td><td>${escaparHtmlEbd(a.status)}</td></tr>`).join("");
  container.innerHTML = `
    <h4>${escaparHtmlEbd(data.servico.descricao || "Serviço")} — ${volDataHora(data.servico.dataHora)} (${escaparHtmlEbd(data.servico.status)})</h4>
    ${ehRodizio ? '<p class="subtitle">Serviço de rodízio: a escala é do grupo da vez (Regimento Art. 135 §1º), por isso o auto-escalador não é usado aqui.</p>' : ""}
    <div class="barra-lista">
      ${data.servico.status === "RASCUNHO" && !ehRodizio ? `<button class="btn-confirmar" style="width:auto;margin:0;" data-on-click="autoEscalarAcao" data-args-click="${argsAttr(servicoId)}">🤖 Rodar Auto-Escalador</button>` : ""}
      ${data.servico.status === "RASCUNHO" ? `<button class="btn-confirmar btn-secundario" style="width:auto;margin:0;" data-on-click="publicarEscalaAcao" data-args-click="${argsAttr(servicoId)}">📣 Publicar</button>` : ""}
    </div>
    <table class="tabela-frequencia"><thead><tr><th>Equipe (id)</th><th>Membro (matrícula)</th><th>Status</th></tr></thead><tbody>${linhasAlocacao || "<tr><td colspan='3'>Nenhuma alocação ainda.</td></tr>"}</tbody></table>`;
}

async function autoEscalarAcao(servicoId) {
  const res = await fetchProtegido(`${API_BASE}/escalas/auto-escalar`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ servicoId })
  });
  const data = await res.json();
  if (data.sucesso === false) { mostrarToast(data.mensagem, "erro"); return; }
  mostrarToast("✅ Auto-escalador rodou — confira a fila de convite por equipe.", "sucesso");
  abrirServicoEscalaAcao(servicoId);
}

async function publicarEscalaAcao(servicoId) {
  const res = await fetchProtegido(`${API_BASE}/escalas/publicar`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ servicoId })
  });
  const data = await res.json();
  if (data.sucesso === false) { mostrarToast(data.mensagem, "erro"); return; }
  mostrarToast(data.mensagem, "sucesso");
  carregarServicosAcao();
  abrirServicoEscalaAcao(servicoId);
}

async function carregarTrocasPendentesAcao() {
  const equipeId = document.getElementById("esEquipeTrocas").value;
  if (!equipeId) return;
  const res = await fetchProtegido(`${API_BASE}/escalas/trocas?equipeId=${equipeId}`);
  const data = await res.json();
  const container = document.getElementById("painelTrocasPendentes");
  if (data.sucesso === false) { container.innerHTML = `<p class="subtitle">${escaparHtmlEbd(data.mensagem)}</p>`; return; }
  container.innerHTML = data.trocas.length
    ? `<table class="tabela-frequencia"><thead><tr><th>Alocação origem</th><th>Destino (matrícula)</th><th>Pedida em</th><th></th></tr></thead><tbody>
        ${data.trocas.map(t => `<tr><td>${t.alocacaoOrigemId}</td><td>${t.membroDestinoId}</td><td>${new Date(t.criadaEm).toLocaleDateString("pt-BR")}</td>
          <td><button class="btn-confirmar" style="width:auto;margin:0;" data-on-click="decidirTrocaAcao" data-args-click="${argsAttr(t.trocaId, true)}">✅ Aprovar</button>
              <button class="btn-confirmar btn-secundario" style="width:auto;margin:0;" data-on-click="decidirTrocaAcao" data-args-click="${argsAttr(t.trocaId, false)}">❌ Recusar</button></td></tr>`).join("")}
      </tbody></table>`
    : "<p class='subtitle'>Nenhuma troca pendente.</p>";
}

async function decidirTrocaAcao(trocaId, aprovar) {
  const res = await fetchProtegido(`${API_BASE}/escalas/trocas-aprovar`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ trocaId, aprovar })
  });
  const data = await res.json();
  mostrarToast(data.mensagem, data.sucesso === false ? "erro" : "sucesso");
  carregarTrocasPendentesAcao();
}

async function carregarPendenciasConfirmacaoAcao() {
  const equipeId = document.getElementById("esEquipePendencias").value;
  if (!equipeId) return;
  const res = await fetchProtegido(`${API_BASE}/escalas/pendencias-confirmacao?equipeId=${equipeId}`);
  const data = await res.json();
  const container = document.getElementById("painelPendenciasConfirmacao");
  if (data.sucesso === false) { container.innerHTML = `<p class="subtitle">${escaparHtmlEbd(data.mensagem)}</p>`; return; }
  container.innerHTML = data.pendencias.length
    ? `<table class="tabela-frequencia"><thead><tr><th>Alocação</th><th>Membro (matrícula)</th><th>Status</th></tr></thead><tbody>
        ${data.pendencias.map(p => `<tr><td>${p.alocacaoId}</td><td>${p.membroId}</td><td>${escaparHtmlEbd(p.status)}</td></tr>`).join("")}
      </tbody></table>`
    : "<p class='subtitle'>✅ Ninguém pendente — todos já confirmaram.</p>";
}

// ---- "Minhas Escalas" (Meu Painel — hook do Portal do Membro, vB.5) ----
async function carregarMinhasEscalasAcao() {
  const res = await fetchProtegido(`${API_BASE}/escalas/minhas-alocacoes`);
  const data = await res.json();
  const container = document.getElementById("resultadoMinhasEscalas");
  if (data.sucesso === false) { container.innerHTML = `<p class="subtitle">${escaparHtmlEbd(data.mensagem)}</p>`; return; }
  if (data.alocacoes.length === 0) { container.innerHTML = "<p class='subtitle'>Nenhum convite de escala no momento.</p>"; return; }

  container.innerHTML = `<div class="rolagem-tabela"><table class="tabela-frequencia"><thead><tr><th>Equipe</th><th>Serviço</th><th>Data/Hora</th><th>Status</th><th></th></tr></thead><tbody>
    ${data.alocacoes.map(a => {
      let acoes = "";
      if (a.status === "CONVIDADO") {
        acoes = `<button class="btn-confirmar" style="width:auto;margin:0;" data-on-click="responderConviteEscalaAcao" data-args-click="${argsAttr(a.alocacaoId, "ACEITO")}">✅ Aceitar</button>
                 <button class="btn-confirmar btn-secundario" style="width:auto;margin:0;" data-on-click="responderConviteEscalaAcao" data-args-click="${argsAttr(a.alocacaoId, "RECUSADO")}">❌ Recusar</button>`;
      } else if (a.status === "ACEITO") {
        acoes = `<button class="btn-confirmar" style="width:auto;margin:0;" data-on-click="confirmarRecebimentoEscalaAcao" data-args-click="${argsAttr(a.alocacaoId)}">📩 Confirmar recebimento</button>
                 <button class="btn-confirmar btn-secundario" style="width:auto;margin:0;" data-on-click="pedirTrocaEscalaAcao" data-args-click="${argsAttr(a.alocacaoId)}">🔄 Pedir troca</button>`;
      }
      const etiquetaRodizio = a.rodizioId ? ` <span class="vol-etiqueta">Rodízio${a.grupoNome ? ` · ${escaparHtmlEbd(a.grupoNome)}` : ""}</span>` : "";
      return `<tr><td>${escaparHtmlEbd(a.equipeNome)}</td><td>${escaparHtmlEbd(a.descricao || "")}${etiquetaRodizio}</td><td>${volDataHora(a.dataHora)}</td><td>${escaparHtmlEbd(a.status)}</td><td>${acoes}</td></tr>`;
    }).join("")}
  </tbody></table></div>`;
}

async function responderConviteEscalaAcao(alocacaoId, resposta) {
  const res = await fetchProtegido(`${API_BASE}/escalas/responder`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ alocacaoId, resposta })
  });
  const data = await res.json();
  mostrarToast(data.mensagem, data.sucesso === false ? "erro" : "sucesso");
  carregarMinhasEscalasAcao();
}

async function confirmarRecebimentoEscalaAcao(alocacaoId) {
  const res = await fetchProtegido(`${API_BASE}/escalas/confirmar`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ alocacaoId })
  });
  const data = await res.json();
  mostrarToast(data.mensagem, data.sucesso === false ? "erro" : "sucesso");
  carregarMinhasEscalasAcao();
}

async function pedirTrocaEscalaAcao(alocacaoOrigemId) {
  const membroDestinoId = prompt("Matrícula do voluntário que vai assumir seu posto:");
  if (!membroDestinoId) return;
  const res = await fetchProtegido(`${API_BASE}/escalas/trocas`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ alocacaoOrigemId, membroDestinoId: Number(membroDestinoId) })
  });
  const data = await res.json();
  mostrarToast(data.mensagem, data.sucesso === false ? "erro" : "sucesso");
}

async function declararIndisponibilidadeAcao() {
  const dataInicio = document.getElementById("meIndisponibilidadeInicio").value;
  const dataFim = document.getElementById("meIndisponibilidadeFim").value;
  const motivo = document.getElementById("meIndisponibilidadeMotivo").value.trim();
  const msg = document.getElementById("resultadoIndisponibilidade");
  if (!dataInicio || !dataFim) { msg.textContent = "Informe início e fim do período."; return; }
  if (dataFim < dataInicio) { msg.textContent = "O fim do período não pode ser antes do início."; return; }
  // Afastamento temporário (Regimento Art. 133 §7º, II): se já há escala marcada no período, a pessoa escolhe se quer liberá-la.
  const conflitos = await volObter(`escalas/indisponibilidade-conflitos?dataInicio=${encodeURIComponent(dataInicio)}&dataFim=${encodeURIComponent(dataFim)}`);
  if (conflitos.sucesso === false) { msg.textContent = volMsgErro(conflitos); return; }
  const marcadas = Array.isArray(conflitos.conflitos) ? conflitos.conflitos : [];
  let liberarEscalas = false;
  if (marcadas.length) {
    const linhasConflito = marcadas.slice(0, 12).map(c => `• ${volDataHora(c.dataHora)} — ${c.equipeNome}`);
    if (marcadas.length > 12) linhasConflito.push(`… e mais ${marcadas.length - 12}.`);
    liberarEscalas = confirm(`Você já está escalado(a) neste período:\n\n${linhasConflito.join("\n")}\n\nLiberar essas escalas? O líder será avisado e não há penalidade.\n\nOK = liberar as escalas. Cancelar = manter as escalas (a indisponibilidade é registrada de qualquer jeito).`);
  }
  const data = await volEnviar("escalas/indisponibilidade", { dataInicio, dataFim, motivo, liberarEscalas });
  if (data.sucesso === false) { msg.textContent = volMsgErro(data); return; }
  msg.textContent = "";
  mostrarToast(data.mensagem || "✅ Indisponibilidade declarada.", "sucesso");
  document.getElementById("meIndisponibilidadeMotivo").value = "";
  carregarMinhasIndisponibilidadesAcao();
  if (data.liberadas) carregarMinhasEscalasAcao();
}

async function carregarMinhasIndisponibilidadesAcao() {
  const res = await fetchProtegido(`${API_BASE}/escalas/indisponibilidade`);
  const data = await res.json();
  const container = document.getElementById("cxMinhasIndisponibilidades");
  if (data.sucesso === false) { container.innerHTML = ""; return; }
  container.innerHTML = data.indisponibilidades.length
    ? `<div class="rolagem-tabela"><table class="tabela-frequencia"><thead><tr><th>Início</th><th>Fim</th><th>Motivo</th></tr></thead><tbody>
        ${data.indisponibilidades.map(i => `<tr><td>${volData(i.dataInicio)}</td><td>${volData(i.dataFim)}</td><td>${escaparHtmlEbd(i.motivo || "")}</td></tr>`).join("")}
      </tbody></table></div>`
    : "<p class='subtitle'>Nenhum período de indisponibilidade declarado.</p>";
}

// ---- HABILITAÇÃO DE VOLUNTÁRIOS (v5.7 — Triagem e habilitação) ----
const ROTULO_ETAPA_HV = {
  FICHA_INSCRICAO: "Ficha de inscrição", REFERENCIAS: "Referências internas", ENTREVISTA: "Entrevista registrada",
  ANTECEDENTES: "Antecedentes (manual até v7.7)", TREINAMENTO: "Treinamento (manual até v7.7)", TERMO: "Termo de Adesão (exige a adesão registrada)"
};
const ORDEM_ETAPAS_HV = ["FICHA_INSCRICAO", "REFERENCIAS", "ENTREVISTA", "ANTECEDENTES", "TREINAMENTO", "TERMO"];
const CAMPO_ETAPA_HV = {
  FICHA_INSCRICAO: "etapaFichaInscricaoEm", REFERENCIAS: "etapaReferenciasEm", ENTREVISTA: "etapaEntrevistaEm",
  ANTECEDENTES: "etapaAntecedentesEm", TREINAMENTO: "etapaTreinamentoEm", TERMO: "etapaTermoAssinadoEm"
};
const ROTULO_STATUS_HV = { APTO: "✅ Apto", PENDENTE: "🟡 Pendente", INAPTO: "⛔ Inapto", VENCIDO: "⏰ Vencido" };
let _hvCongregacaoAtual = null;

async function carregarOpcoesHabilitacaoAcao() {
  const selCong = document.getElementById("hvCongregacao");
  if (selCong && !selCong.dataset.montado) {
    const congs = await listaDaApi(fetchProtegido(`${API_BASE}/catalogos/congregacoes`));
    selCong.innerHTML = congs.filter(c => c.ativa !== false).map(c => `<option value="${c.congregacaoId}">${escaparHtmlEbd(c.nome)}</option>`).join("");
    selCong.dataset.montado = "1";
  }
}

function montarEsteiraHtml(hab) {
  return ORDEM_ETAPAS_HV.map(etapa => {
    const concluida = !!hab[CAMPO_ETAPA_HV[etapa]];
    return `<span class="tag" style="margin-right:4px;${concluida ? "" : "opacity:.5;"}">${concluida ? "✅" : "⬜"} ${ROTULO_ETAPA_HV[etapa]}</span>`;
  }).join(" → ");
}

async function carregarEquipesFlagAcao() {
  const congregacaoId = document.getElementById("hvCongregacao").value;
  if (!congregacaoId) return;
  _hvCongregacaoAtual = congregacaoId;
  const res = await fetchProtegido(`${API_BASE}/habilitacao-voluntarios/equipes-flag?congregacaoId=${congregacaoId}`);
  const data = await res.json();
  const container = document.getElementById("painelEquipesFlag");
  if (data.sucesso === false) { container.innerHTML = `<p class="subtitle">${escaparHtmlEbd(data.mensagem)}</p>`; return; }
  container.innerHTML = data.equipes.length
    ? `<table class="tabela-frequencia"><thead><tr><th>Equipe</th><th>Contato com menores</th><th></th></tr></thead><tbody>
        ${data.equipes.map(e => `<tr><td>${escaparHtmlEbd(e.nome)}</td><td>${e.contatoComMenores ? "Sim" : "Não"}</td>
          <td><button class="btn-confirmar btn-secundario" style="width:auto;margin:0;" data-on-click="alternarContatoComMenoresAcao" data-args-click="${argsAttr(e.equipeId, !e.contatoComMenores)}">
            ${e.contatoComMenores ? "Desmarcar" : "Marcar como contato com menores"}</button></td></tr>`).join("")}
      </tbody></table>`
    : "<p class='subtitle'>Nenhuma equipe cadastrada nesta congregação ainda (cadastre em Escalas de Serviço).</p>";

  await carregarHabilitacoesAcao();
  volCarregarHabilitacaoAcao();
}

async function alternarContatoComMenoresAcao(equipeId, novoValor) {
  const res = await fetchProtegido(`${API_BASE}/habilitacao-voluntarios/equipes-flag`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ equipeId, contatoComMenores: novoValor })
  });
  const data = await res.json();
  mostrarToast(data.mensagem, data.sucesso === false ? "erro" : "sucesso");
  carregarEquipesFlagAcao();
}

async function carregarHabilitacoesAcao() {
  if (!_hvCongregacaoAtual) return;
  const res = await fetchProtegido(`${API_BASE}/habilitacao-voluntarios/lista?congregacaoId=${_hvCongregacaoAtual}`);
  const data = await res.json();
  const container = document.getElementById("painelHabilitacoes");
  if (data.sucesso === false) { container.innerHTML = `<p class="subtitle">${escaparHtmlEbd(data.mensagem)}</p>`; return; }
  container.innerHTML = data.habilitacoes.length
    ? `<table class="tabela-frequencia"><thead><tr><th>Voluntário</th><th>Status</th><th>Esteira</th><th></th></tr></thead><tbody>
        ${data.habilitacoes.map(h => `<tr><td>${escaparHtmlEbd(h.membroNome)}</td><td>${ROTULO_STATUS_HV[h.statusCalculado] || escaparHtmlEbd(h.statusCalculado)}</td>
          <td>${montarEsteiraHtml(h)}</td>
          <td><button class="btn-confirmar btn-secundario" style="width:auto;margin:0;" data-on-click="abrirDetalheHabilitacaoAcao" data-args-click="${argsAttr(h.habilitacaoId)}">🔍 Abrir</button></td></tr>`).join("")}
      </tbody></table>`
    : "<p class='subtitle'>Nenhuma esteira aberta nesta congregação ainda.</p>";
}

async function iniciarHabilitacaoAcao() {
  const membroId = document.getElementById("hvNovoMembroMatricula").value;
  const congregacaoId = document.getElementById("hvCongregacao").value;
  const msg = document.getElementById("resultadoHabilitacao");
  if (!membroId || !congregacaoId) { msg.textContent = "Escolha a congregação e informe a matrícula do voluntário."; return; }
  const res = await fetchProtegido(`${API_BASE}/habilitacao-voluntarios/iniciar`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ membroId: Number(membroId), congregacaoId: Number(congregacaoId) })
  });
  const data = await res.json();
  if (data.sucesso === false) { mostrarToast(data.mensagem, "erro"); return; }
  mostrarToast("✅ Esteira aberta (ou já existente reaproveitada).", "sucesso");
  document.getElementById("hvNovoMembroMatricula").value = "";
  carregarHabilitacoesAcao();
}

async function abrirDetalheHabilitacaoAcao(habilitacaoId) {
  // A lista já trouxe o necessário pra montar as ações; refazemos a busca
  // pontual só pra ter o objeto fresco (evita mandar índice desatualizado
  // depois de concluir uma etapa).
  const listaRes = await fetchProtegido(`${API_BASE}/habilitacao-voluntarios/lista?congregacaoId=${_hvCongregacaoAtual}`);
  const listaData = await listaRes.json();
  const hab = listaData.sucesso !== false ? listaData.habilitacoes.find(h => h.habilitacaoId === habilitacaoId) : null;
  const container = document.getElementById("painelDetalheHabilitacao");
  if (!hab) { container.innerHTML = "<p class='subtitle'>Esteira não encontrada.</p>"; return; }

  const proxima = hab.proximaEtapa;
  container.innerHTML = `
    <h4>${escaparHtmlEbd(hab.membroNome)} — ${ROTULO_STATUS_HV[hab.statusCalculado] || escaparHtmlEbd(hab.statusCalculado)}</h4>
    <p>${montarEsteiraHtml(hab)}</p>
    ${proxima === "TERMO" ? '<p class="subtitle">Esta etapa só fecha depois que o voluntário aderir ao Termo (aceite digital, ficha, e-mail/WhatsApp ou Lista de Ouro).</p>' : ""}
    <div class="barra-lista">
      ${proxima ? `<button class="btn-confirmar" style="width:auto;margin:0;" data-on-click="concluirEtapaHabilitacaoAcao" data-args-click="${argsAttr(habilitacaoId, String(proxima ?? ""))}">✅ Concluir: ${ROTULO_ETAPA_HV[proxima]}</button>` : "<span class='subtitle'>Esteira completa.</span>"}
      <button class="btn-confirmar btn-secundario" style="width:auto;margin:0;" data-on-click="marcarInaptoAcao" data-args-click="${argsAttr(habilitacaoId)}">⛔ Marcar Inapto</button>
      <button class="btn-confirmar btn-secundario" style="width:auto;margin:0;" data-on-click="reabilitarHabilitacaoAcao" data-args-click="${argsAttr(habilitacaoId)}">↩️ Reabilitar</button>
    </div>
    ${hab.inaptoMotivo ? `<p class="subtitle">Motivo da inaptidão: ${escaparHtmlEbd(hab.inaptoMotivo)}</p>` : ""}
  `;
}

async function concluirEtapaHabilitacaoAcao(habilitacaoId, etapa) {
  let observacao = null, entrevistadorId = null;
  if (etapa === "ENTREVISTA") {
    entrevistadorId = prompt("Matrícula de quem conduziu a entrevista (opcional):") || null;
    observacao = prompt("Observações da entrevista (opcional):") || null;
  } else if (etapa === "REFERENCIAS") {
    observacao = prompt("Observações sobre as referências colhidas (opcional):") || null;
  }
  const res = await fetchProtegido(`${API_BASE}/habilitacao-voluntarios/concluir-etapa`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ habilitacaoId, etapa, observacao, entrevistadorId: entrevistadorId ? Number(entrevistadorId) : null })
  });
  const data = await res.json();
  mostrarToast(data.mensagem, data.sucesso === false ? "erro" : "sucesso");
  carregarHabilitacoesAcao();
  abrirDetalheHabilitacaoAcao(habilitacaoId);
}

async function marcarInaptoAcao(habilitacaoId) {
  const motivo = prompt("Motivo da inaptidão:");
  if (!motivo) return;
  const res = await fetchProtegido(`${API_BASE}/habilitacao-voluntarios/marcar-inapto`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ habilitacaoId, motivo })
  });
  const data = await res.json();
  mostrarToast(data.mensagem, data.sucesso === false ? "erro" : "sucesso");
  carregarHabilitacoesAcao();
  abrirDetalheHabilitacaoAcao(habilitacaoId);
}

async function reabilitarHabilitacaoAcao(habilitacaoId) {
  const res = await fetchProtegido(`${API_BASE}/habilitacao-voluntarios/reabilitar`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ habilitacaoId })
  });
  const data = await res.json();
  mostrarToast(data.mensagem, data.sucesso === false ? "erro" : "sucesso");
  carregarHabilitacoesAcao();
  abrirDetalheHabilitacaoAcao(habilitacaoId);
}

async function registrarDesligamentoAcao() {
  const membroId = document.getElementById("hvDesligarMatricula").value;
  const equipeId = document.getElementById("hvDesligarEquipeId").value;
  const tipoMotivo = document.getElementById("hvDesligarTipo").value;
  const motivo = document.getElementById("hvDesligarMotivo").value.trim();
  const removidoDaEscala = document.getElementById("hvDesligarRemoverEscala").checked;
  const msg = document.getElementById("resultadoDesligamento");
  if (!membroId || !motivo) { msg.textContent = "Informe a matrícula e o motivo."; return; }
  // v7.5: "remover da escala" tem efeito imediato e, sem o id da equipe, vale para todas as equipes do seu escopo. Pede confirmação antes.
  if (removidoDaEscala && !confirm(equipeId
    ? "Remover este voluntário da escala da equipe " + equipeId + "?\n\nAs escalas futuras dele nessa equipe são canceladas agora e ele é avisado."
    : "Remover este voluntário da escala de TODAS as equipes que o seu escopo alcança?\n\nAs escalas futuras dele nelas são canceladas agora e ele é avisado.")) return;
  const res = await fetchProtegido(`${API_BASE}/habilitacao-voluntarios/desligamento`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ membroId: Number(membroId), equipeId: equipeId ? Number(equipeId) : null, tipoMotivo, motivo, removidoDaEscala })
  });
  const data = await res.json();
  msg.textContent = "";
  if (data.sucesso === false) { mostrarToast(data.mensagem, "erro"); return; }
  mostrarToast(data.mensagem, "sucesso");
  document.getElementById("hvDesligarMatricula").value = "";
  document.getElementById("hvDesligarMotivo").value = "";
}

// ---- "Minha Habilitação" (Meu Painel — autoatendimento, só leitura) ----
async function carregarMinhaHabilitacaoAcao() {
  volCarregarTermoAcao();   // o cartão do Termo não depende de a pessoa ter esteira aberta
  const res = await fetchProtegido(`${API_BASE}/habilitacao-voluntarios/minha-habilitacao`);
  const data = await res.json();
  const container = document.getElementById("resultadoMinhaHabilitacao");
  if (data.sucesso === false) { container.innerHTML = `<p class="subtitle">${escaparHtmlEbd(data.mensagem)}</p>`; return; }
  if (!data.habilitacao) { container.innerHTML = "<p class='subtitle'>Você ainda não tem uma esteira de habilitação de voluntário aberta.</p>"; return; }
  const hab = data.habilitacao;
  container.innerHTML = `<p><strong>Status:</strong> ${ROTULO_STATUS_HV[hab.statusCalculado] || escaparHtmlEbd(hab.statusCalculado)}</p><p>${montarEsteiraHtml(hab)}</p>`;
}

// ---- ASSISTÊNCIA SOCIAL / AÇÃO DA FÉ (v5.9) ----
// Dado mais sensível do sistema — a permissão "assistencia_social" (nunca
// concedida por padrão) já esconde a aba inteira no menu; o backend
// (GestaoAssistenciaSocial) recusa de novo se alguém tentar chamar a rota
// direto sem ela — defesa em profundidade, mesmo padrão do resto do sistema.
const ROTULO_TIPO_BENEFICIO_AS = { CESTA_BASICA: "Cesta básica", AUXILIO_FINANCEIRO: "Auxílio financeiro", MEDICAMENTO: "Medicamento", OUTRO: "Outro" };

async function carregarOpcoesAssistenciaSocialAcao() {
  const selCong = document.getElementById("asCongregacao");
  if (selCong && !selCong.dataset.montado) {
    const congs = await listaDaApi(fetchProtegido(`${API_BASE}/catalogos/congregacoes`));
    selCong.innerHTML = congs.filter(c => c.ativa !== false).map(c => `<option value="${c.congregacaoId}">${escaparHtmlEbd(c.nome)}</option>`).join("");
    selCong.dataset.montado = "1";
  }
}

async function carregarFamiliasAssistenciaAcao() {
  const congregacaoId = document.getElementById("asCongregacao").value;
  if (!congregacaoId) return;
  const res = await fetchProtegido(`${API_BASE}/assistencia-social/familias?congregacaoId=${congregacaoId}`);
  const data = await res.json();
  const container = document.getElementById("painelFamiliasAssistencia");
  if (data.sucesso === false) { container.innerHTML = `<p class="subtitle">${escaparHtmlEbd(data.mensagem)}</p>`; return; }
  container.innerHTML = data.familias.length
    ? `<table class="tabela-frequencia"><thead><tr><th>Id</th><th>Responsável</th><th>Contato</th></tr></thead><tbody>
        ${data.familias.map(f => `<tr><td>${f.familiaId}</td><td>${escaparHtmlEbd(f.responsavelNome)}</td><td>${escaparHtmlEbd(f.responsavelContato) || "-"}</td></tr>`).join("")}
      </tbody></table>`
    : "<p class='subtitle'>Nenhuma família cadastrada nesta congregação ainda.</p>";
}

async function criarFamiliaAssistenciaAcao() {
  const congregacaoId = document.getElementById("asCongregacao").value;
  const responsavelNome = document.getElementById("asFamResponsavelNome").value.trim();
  const responsavelCpf = document.getElementById("asFamResponsavelCpf").value.trim();
  const responsavelContato = document.getElementById("asFamResponsavelContato").value.trim();
  const endereco = document.getElementById("asFamEndereco").value.trim();
  const membroId = document.getElementById("asFamMembroId").value;
  const msg = document.getElementById("resultadoFamiliaAssistencia");
  if (!congregacaoId || !responsavelNome) { msg.textContent = "Escolha a congregação e informe o nome do responsável."; return; }
  const res = await fetchProtegido(`${API_BASE}/assistencia-social/familias`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ congregacaoId: Number(congregacaoId), responsavelNome, responsavelCpf: responsavelCpf || null, responsavelContato: responsavelContato || null, endereco: endereco || null, membroId: membroId ? Number(membroId) : null })
  });
  const data = await res.json();
  msg.textContent = "";
  if (data.sucesso === false) { mostrarToast(data.mensagem, "erro"); return; }
  mostrarToast(data.mensagem, "sucesso");
  document.getElementById("asFamResponsavelNome").value = "";
  document.getElementById("asFamResponsavelCpf").value = "";
  document.getElementById("asFamResponsavelContato").value = "";
  document.getElementById("asFamEndereco").value = "";
  document.getElementById("asFamMembroId").value = "";
  carregarFamiliasAssistenciaAcao();
}

async function carregarDetalheFamiliaAssistenciaAcao() {
  const familiaId = document.getElementById("asFamiliaIdDetalhe").value;
  const container = document.getElementById("painelDetalheFamiliaAssistencia");
  if (!familiaId) { container.innerHTML = ""; return; }
  const res = await fetchProtegido(`${API_BASE}/assistencia-social/familia?familiaId=${familiaId}`);
  const data = await jsonDaTela(res, container, "objeto");
  if (data === null) return;
  if (data.sucesso === false) { container.innerHTML = `<p class="subtitle">${escaparHtmlEbd(data.mensagem)}</p>`; return; }

  const cadastroAtivo = (data.cadastros || []).find(c => c.status === "ATIVO");
  const alertas = (data.recorrencia || []).filter(r => r.alertaRecorrencia);

  container.innerHTML = `
    <h4>${escaparHtmlEbd(data.familia.responsavelNome)}</h4>
    ${alertas.length ? `<p class="subtitle">⚠️ Recorrência: ${alertas.map(a => `${ROTULO_TIPO_BENEFICIO_AS[a.tipoBeneficio] || escaparHtmlEbd(a.tipoBeneficio)} há ${escaparHtmlEbd(a.mesesConsecutivos)} meses seguidos`).join("; ")}</p>` : ""}

    <h5>Cadastro socioeconômico (Art. 46)</h5>
    ${cadastroAtivo
      ? `<p>Núcleo: ${escaparHtmlEbd(cadastroAtivo.qtdPessoasNucleo)} pessoa(s) — Situação de moradia: ${escaparHtmlEbd(cadastroAtivo.situacaoMoradia)} — Base legal: ${escaparHtmlEbd(cadastroAtivo.baseLegal)}</p>
         <p class="subtitle">${escaparHtmlEbd(cadastroAtivo.observacoes) || ""}</p>
         <div class="barra-lista">
           <input type="number" id="asProfissionalMatricula_${cadastroAtivo.cadastroId}" placeholder="Matrícula do Assistente Social" style="max-width:220px;" />
           <select id="asParecerResultado_${cadastroAtivo.cadastroId}"><option value="APROVADO">Aprovado</option><option value="NEGADO">Negado</option><option value="PENDENTE_DOCUMENTACAO">Pendente de documentação</option></select>
           <input type="text" id="asParecerTexto_${cadastroAtivo.cadastroId}" placeholder="Parecer técnico" style="min-width:260px;" />
           <button class="btn-confirmar" style="width:auto;margin:0;" data-on-click="registrarParecerAssistenciaAcao" data-args-click="${argsAttr(cadastroAtivo.cadastroId, data.familia.familiaId)}">✍️ Registrar Parecer</button>
         </div>`
      : `<div class="barra-lista">
           <input type="number" id="asCadastroQtd_${data.familia.familiaId}" placeholder="Pessoas no núcleo" style="max-width:160px;" />
           <input type="number" id="asCadastroRenda_${data.familia.familiaId}" placeholder="Renda mensal (opcional)" style="max-width:180px;" />
           <select id="asCadastroSituacao_${data.familia.familiaId}"><option value="PROPRIA">Própria</option><option value="ALUGADA">Alugada</option><option value="CEDIDA">Cedida</option><option value="SITUACAO_RISCO">Situação de risco</option><option value="OUTRO">Outro</option></select>
           <input type="text" id="asCadastroObs_${data.familia.familiaId}" placeholder="Observações" style="min-width:220px;" />
           <button class="btn-confirmar" style="width:auto;margin:0;" data-on-click="abrirCadastroSocioeconomicoAcao" data-args-click="${argsAttr(data.familia.familiaId)}">📋 Abrir Cadastro (com consentimento)</button>
         </div>`}
    <p id="resultadoCadastroAssistencia_${data.familia.familiaId}" class="subtitle"></p>

    <h5>Pareceres</h5>
    <div id="painelPareceresAssistencia_${data.familia.familiaId}"></div>

    <h5>Entregas de benefício</h5>
    <div class="barra-lista">
      <select id="asEntregaTipo_${data.familia.familiaId}">${Object.entries(ROTULO_TIPO_BENEFICIO_AS).map(([v, r]) => `<option value="${v}">${r}</option>`).join("")}</select>
      <input type="date" id="asEntregaData_${data.familia.familiaId}" style="max-width:160px;" />
      <input type="number" id="asEntregaValor_${data.familia.familiaId}" placeholder="Valor (opcional)" style="max-width:150px;" />
      <input type="text" id="asEntregaDescricao_${data.familia.familiaId}" placeholder="Descrição (opcional)" style="min-width:200px;" />
      <button class="btn-confirmar" style="width:auto;margin:0;" data-on-click="registrarEntregaAssistenciaAcao" data-args-click="${argsAttr(data.familia.familiaId)}">➕ Registrar Entrega</button>
    </div>
    ${(data.entregas || []).length
      ? `<table class="tabela-frequencia"><thead><tr><th>Data</th><th>Tipo</th><th>Valor</th><th>Descrição</th></tr></thead><tbody>
          ${data.entregas.map(e => `<tr><td>${new Date(e.dataEntrega).toLocaleDateString("pt-BR")}</td><td>${ROTULO_TIPO_BENEFICIO_AS[e.tipoBeneficio] || escaparHtmlEbd(e.tipoBeneficio)}</td><td>${e.valor != null ? "R$ " + Number(e.valor).toFixed(2) : "-"}</td><td>${escaparHtmlEbd(e.descricao) || "-"}</td></tr>`).join("")}
        </tbody></table>`
      : "<p class='subtitle'>Nenhuma entrega registrada ainda.</p>"}
  `;
  if (cadastroAtivo) carregarPareceresAssistenciaAcao(cadastroAtivo.cadastroId, data.familia.familiaId);
}

async function abrirCadastroSocioeconomicoAcao(familiaId) {
  const qtd = document.getElementById(`asCadastroQtd_${familiaId}`).value;
  const renda = document.getElementById(`asCadastroRenda_${familiaId}`).value;
  const situacaoMoradia = document.getElementById(`asCadastroSituacao_${familiaId}`).value;
  const observacoes = document.getElementById(`asCadastroObs_${familiaId}`).value.trim();
  const msg = document.getElementById(`resultadoCadastroAssistencia_${familiaId}`);
  if (!qtd) { msg.textContent = "Informe a quantidade de pessoas do núcleo."; return; }
  if (!confirm("Confirma que o consentimento do titular/responsável (LGPD Art. 7º, I) foi obtido antes de registrar este cadastro socioeconômico?")) return;
  const res = await fetchProtegido(`${API_BASE}/assistencia-social/cadastro`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      familiaId, qtdPessoasNucleo: Number(qtd), rendaFamiliarMensal: renda ? Number(renda) : null,
      situacaoMoradia, observacoes: observacoes || null, baseLegal: "CONSENTIMENTO", consentimentoObtidoEm: new Date().toISOString()
    })
  });
  const data = await res.json();
  if (data.sucesso === false) { mostrarToast(data.mensagem, "erro"); return; }
  mostrarToast(data.mensagem, "sucesso");
  document.getElementById("asFamiliaIdDetalhe").value = familiaId;
  carregarDetalheFamiliaAssistenciaAcao();
}

async function registrarParecerAssistenciaAcao(cadastroId, familiaId) {
  const profissionalMembroId = document.getElementById(`asProfissionalMatricula_${cadastroId}`).value;
  const resultado = document.getElementById(`asParecerResultado_${cadastroId}`).value;
  const parecer = document.getElementById(`asParecerTexto_${cadastroId}`).value.trim();
  if (!profissionalMembroId || !parecer) { mostrarToast("Informe a matrícula do Assistente Social credenciado e o texto do parecer.", "erro"); return; }
  const res = await fetchProtegido(`${API_BASE}/assistencia-social/parecer`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ cadastroId, profissionalMembroId: Number(profissionalMembroId), resultado, parecer })
  });
  const data = await res.json();
  mostrarToast(data.mensagem, data.sucesso === false ? "erro" : "sucesso");
  if (data.sucesso !== false) carregarPareceresAssistenciaAcao(cadastroId, familiaId);
}

async function carregarPareceresAssistenciaAcao(cadastroId, familiaId) {
  const res = await fetchProtegido(`${API_BASE}/assistencia-social/pareceres?cadastroId=${cadastroId}`);
  const data = await res.json();
  const container = document.getElementById(`painelPareceresAssistencia_${familiaId}`);
  if (!container) return;
  if (data.sucesso === false) { container.innerHTML = `<p class="subtitle">${escaparHtmlEbd(data.mensagem)}</p>`; return; }
  container.innerHTML = data.pareceres.length
    ? `<table class="tabela-frequencia"><thead><tr><th>Data</th><th>Profissional</th><th>Resultado</th><th>Parecer</th></tr></thead><tbody>
        ${data.pareceres.map(p => `<tr><td>${new Date(p.assinadoEm).toLocaleDateString("pt-BR")}</td><td>${escaparHtmlEbd(p.profissionalNome)} (CRESS ${escaparHtmlEbd(p.numeroCredencial)})</td><td>${escaparHtmlEbd(p.resultado)}</td><td>${escaparHtmlEbd(p.parecer)}</td></tr>`).join("")}
      </tbody></table>`
    : "<p class='subtitle'>Nenhum parecer registrado ainda.</p>";
}

async function registrarEntregaAssistenciaAcao(familiaId) {
  const tipoBeneficio = document.getElementById(`asEntregaTipo_${familiaId}`).value;
  const dataEntrega = document.getElementById(`asEntregaData_${familiaId}`).value;
  const valor = document.getElementById(`asEntregaValor_${familiaId}`).value;
  const descricao = document.getElementById(`asEntregaDescricao_${familiaId}`).value.trim();
  if (!dataEntrega) { mostrarToast("Informe a data da entrega.", "erro"); return; }
  const res = await fetchProtegido(`${API_BASE}/assistencia-social/entrega`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ familiaId, tipoBeneficio, dataEntrega, valor: valor ? Number(valor) : null, descricao: descricao || null })
  });
  const data = await res.json();
  mostrarToast(data.mensagem, data.sucesso === false ? "erro" : "sucesso");
  if (data.sucesso !== false) carregarDetalheFamiliaAssistenciaAcao();
}

async function credenciarProfissionalAssistenciaAcao() {
  const membroId = document.getElementById("asCredenciarMatricula").value;
  const numeroCredencial = document.getElementById("asCredenciarNumero").value.trim();
  const msg = document.getElementById("resultadoCredenciamentoAssistencia");
  if (!membroId || !numeroCredencial) { msg.textContent = "Informe a matrícula e o número de registro (CRESS)."; return; }
  const res = await fetchProtegido(`${API_BASE}/assistencia-social/profissionais`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ membroId: Number(membroId), numeroCredencial })
  });
  const data = await res.json();
  msg.textContent = "";
  if (data.sucesso === false) { mostrarToast(data.mensagem, "erro"); return; }
  mostrarToast(data.mensagem, "sucesso");
  document.getElementById("asCredenciarMatricula").value = "";
  document.getElementById("asCredenciarNumero").value = "";
  carregarProfissionaisAssistenciaAcao();
}

async function carregarProfissionaisAssistenciaAcao() {
  const res = await fetchProtegido(`${API_BASE}/assistencia-social/profissionais`);
  const data = await res.json();
  const container = document.getElementById("painelProfissionaisAssistencia");
  if (data.sucesso === false) { container.innerHTML = `<p class="subtitle">${escaparHtmlEbd(data.mensagem)}</p>`; return; }
  container.innerHTML = data.profissionais.length
    ? `<table class="tabela-frequencia"><thead><tr><th>Nome</th><th>CRESS</th><th>Situação</th><th></th></tr></thead><tbody>
        ${data.profissionais.map(p => `<tr><td>${escaparHtmlEbd(p.membroNome)}</td><td>${escaparHtmlEbd(p.numeroCredencial)}</td><td>${p.ativo ? "✅ Ativo" : "⛔ Inativo"}</td>
          <td>${p.ativo ? `<button class="btn-confirmar btn-secundario" style="width:auto;margin:0;" data-on-click="descredenciarProfissionalAssistenciaAcao" data-args-click="${argsAttr(p.profissionalId)}">Descredenciar</button>` : ""}</td></tr>`).join("")}
      </tbody></table>`
    : "<p class='subtitle'>Nenhum Assistente Social credenciado ainda.</p>";
}

async function descredenciarProfissionalAssistenciaAcao(profissionalId) {
  const motivo = prompt("Motivo do descredenciamento:");
  if (!motivo) return;
  const res = await fetchProtegido(`${API_BASE}/assistencia-social/profissionais/descredenciar`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ profissionalId, motivo })
  });
  const data = await res.json();
  mostrarToast(data.mensagem, data.sucesso === false ? "erro" : "sucesso");
  carregarProfissionaisAssistenciaAcao();
}

async function carregarPrestacaoContasAssistenciaAcao() {
  const mes = document.getElementById("asPrestacaoMes").value;
  const ano = document.getElementById("asPrestacaoAno").value;
  const container = document.getElementById("painelPrestacaoContasAssistencia");
  if (!mes || !ano) { container.innerHTML = "<p class='subtitle'>Informe mês e ano.</p>"; return; }
  const res = await fetchProtegido(`${API_BASE}/assistencia-social/prestacao-contas?mes=${mes}&ano=${ano}`);
  const data = await jsonDaTela(res, container, "objeto");
  if (data === null) return;
  if (data.sucesso === false || data.departamentoEncontrado === false) { container.innerHTML = `<p class="subtitle">${escaparHtmlEbd(data.mensagem) || "Erro ao carregar."}</p>`; return; }
  container.innerHTML = `
    <p><strong>Famílias atendidas no mês:</strong> ${escaparHtmlEbd(data.totalFamiliasAtendidas)} — <strong>Valor total das entregas:</strong> R$ ${Number(data.totalValorEntregas || 0).toFixed(2)}</p>
    <p>${Object.entries(data.totalEntregasPorTipo || {}).map(([tipo, qtd]) => `${ROTULO_TIPO_BENEFICIO_AS[tipo] || escaparHtmlEbd(tipo)}: ${escaparHtmlEbd(qtd)}`).join(" · ") || "Nenhuma entrega no período."}</p>
    <p class="subtitle">Fechamento departamental (v5.4, Ação da Fé — separado do caixa comum): ${data.fechamentoMensal ? `Total de despesas R$ ${Number(data.fechamentoMensal.TotalDespesas || 0).toFixed(2)}` : "mês ainda não fechado."}</p>
  `;
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
  abrirCadastroSocioeconomicoAcao, abrirCredenciamentoAssembleia,
  abrirDetalheHabilitacaoAcao,
  abrirModalAnexos, abrirModalExportarPessoas, abrirNotificacao, abrirPerfilPessoa,
  abrirProcedimentoAbandonoAcao, abrirReuniao, abrirServicoEscalaAcao,
  acaoCandidatoBatismo, acaoMinhaTarefa, acaoTurmaBatismo, acessarPainel,
  adicionarBlocoPerguntaEnquete, adicionarMembroCCJ, adicionarMembroEquipeAcao,
  adicionarMembroPMO, afastarCautelarAcao,
  ajustarPrazoProcessoAcao, alterarMeuPinAcao, alterarVisibilidadeDocumentoAcao, alternarAjudaContextual,
  alternarContatoComMenoresAcao,
  alternarDiscipuladoBatismoAcao,
  alternarLoginPorCodigo, alternarMenuCelular, alternarMeusDadosLGPD, alternarModoLeitura, alternarPainelNotificacoes, alternarPushAcao, alternarSidebar,
  aplicarFiltroElegiveis, aplicarFiltroPessoas, aplicarMedidaCautelarAcao, aprovarJustificativaPendente,
  aprovarTodaSolicitacaoAcao, arquivarNotificacao,
  arquivarProcedimentoAbandonoAcao, ativarComTeclado, atribuirTurmaBatismoAcao,
  atualizarNotificacaoRegra, atualizarNucleoFundamentalVisivel,
  atualizarPoliticaRetencao,
  autoEscalarAcao, avancarConsagracaoAcao, baixarMinutaAta, baixarModeloPessoas, baixarPdfCarta,
  cancelarCarta,
  cancelarDelegacaoAcao, cancelarEdicaoConvocacaoAcao,
  carregarAlertasComplianceAcao, carregarAuditoria,
  carregarDetalheFamiliaAssistenciaAcao,
  carregarDocumentos, carregarEquipesAcao, carregarEquipesFlagAcao, carregarFamiliasAssistenciaAcao,
  carregarIndicadoresAcao,
  carregarPendenciasConfirmacaoAcao,
  carregarPrestacaoContasAssistenciaAcao, carregarRecertificacoesAcao,
  carregarSolicitacoesDPO, carregarTrocasPendentesAcao,
  checarElegibilidadeCEIAcao, citarAcao,
  concederConsentimentoFotoAcao,
  concluirEtapaHabilitacaoAcao,
  concluirRelatorioCautelarAcao, confirmarCartaPendente, confirmarCodigoAcessoAcao,
  confirmarRecebimentoEscalaAcao,
  convocarAssembleiaAcao, corrigirMarcoMembroAcao,
  credenciarMembroAcao, credenciarProfissionalAssistenciaAcao,
  criarDelegacaoAcao, criarEquipeAcao, criarFamiliaAssistenciaAcao,
  criarPinAcao,
  criarServicoAcao, criarSolicitacaoLGPD,
  decidirCampoFilaAcao, decidirRecertificacaoAcao,
  decidirSinalizacaoNifAcao, decidirTrocaAcao, declararIndisponibilidadeAcao, definirDecisaoImportacao,
  derrubarAcessosPessoa, desativarCongregacaoDetalheAcao,
  descredenciarProfissionalAssistenciaAcao, designarDefensorAcao,
  designarRelatorAcao, desligarPessoaPerfilAcao, editarCatalogo, editarCongregacaoDetalhe, editarConvocacaoAcao,
  editarDiasRetencaoAcao, editarOrgao, editarPapel, editarPermissao, editarTituloNotificacaoRegra,
  emitirCarta, emitirParecerAcao,
  encerrarAssentoAcao, encerrarAssentoCEIAcao, encerrarAssentoCLIAcao,
  encerrarAssentoConselhoFiscalAcao, encerrarAssentoDiretoriaAcao, encerrarEnqueteAcao,
  encerrarReuniaoAcao, encerrarSessaoAcao, entrarModulo, enviarAnexoModal, enviarFotoMembroAcao,
  enviarMinhaFotoAcao, enviarPresenca, enviarSolicitacaoEdicaoAcao,
  excluirAnexoModal, excluirApresentacaoCriancaAcao, excluirCasamentoAcao, excluirCatalogo, excluirCongregacaoDetalheAcao,
  excluirConvocacaoAcao, excluirDocumentoAcao, excluirOrgao, executarExclusaoDPO,
  fecharModal, fecharPrimeiroAcesso,
  filtrarCatalogo, filtrarMinhasTarefas,
  gerarPinProvisorioAcao, gerarRelatorioCredenciamentoAcao,
  homologarExclusaoAcao, homologarProcedimentoAbandonoAcao,
  imprimirCarta, imprimirMinhaCarta, iniciarHabilitacaoAcao, iniciarSessaoConvocadaAcao,
  inscreverCandidatoBatismoAcao, instalarAppAcao, irParaBlocoPainel, irParaResultadoBusca, julgarProcessoAcao,
  justificarFalta, limparFormCongregacaoDetalhe,
  marcarInaptoAcao, marcarPresencaManual, marcarTodasNotificacoesLidas,
  marcarUrgenciaAcao, mostrarAbaPerfil,
  mostrarAbaSecretaria, mostrarSubAbaMeupainel, mostrarSubAbaPessoas, mostrarTelaPainelInicial,
  mudarPaginaCatalogo, mudarPaginaElegiveis, mudarPaginaPessoas, onChangeEscopoTipoLote, onChangeEscopoTipoPermissao, onChangePublicoEnquete,
  onChangeTipoPerguntaEnquete, onChangeVinculanteEnquete, onDigitarBuscaGlobal, parecerCandidatoBatismoAcao, pedirTrocaEscalaAcao,
  prepararImportacaoPessoas, processarSaidasCartas,
  publicarEscalaAcao, reabilitarHabilitacaoAcao,
  reativarCongregacaoDetalheAcao,
  recorrerAcao, redefinirSenhaLideranca, registrarAceiteAcao, registrarAncoragemAcao,
  registrarAuditoriaNivelAcao, registrarAutolancamentoAcao, registrarComunicacaoCoafAcao,
  registrarConflitoInteresseAcao, registrarDefesaAcao, registrarDesligamentoAcao,
  registrarDoacaoAcao, registrarDueDiligenceAcao, registrarEntregaAssistenciaAcao,
  registrarMarcoMembroAcao,
  registrarParecerAssistenciaAcao, registrarParecerConselhoAcao,
  registrarPoliticaAcao, registrarPrestacaoContasAcao, registrarProvaReintegracaoAcao, registrarRecursoAbandonoAcao,
  registrarRetornoLicencaAcao,
  registrarSinalizacaoNifAcao, registrarTentativaContatoAcao,
  registrarVersaoTextoMestreAcao, rejeitarJustificativaAcao,
  removerBlocoPerguntaEnquete, removerMembroComissaoAcao, removerMeuVinculoAcao,
  removerPermissao, removerVinculoFamiliar,
  reprovarCandidatoBatismoAcao, reprovarConsagracaoAcao, resolverAlertaComplianceAcao,
  responderConviteEscalaAcao, responderSolicitacaoDPO, sairDoModulo, sairDoPainel,
  salvarApresentacaoCrianca, salvarAssento, salvarAssentoCEI, salvarAssentoCLI, salvarAssentoConselhoFiscal,
  salvarAssentoDiretoria, salvarCasamento,
  salvarCatalogo, salvarCongregacaoDetalhe, salvarConsagracao, salvarConsentimentoLGPD,
  salvarDocumentoAcao,
  salvarEnquete,
  salvarLicencaCandidatura, salvarMeusDadosAcao, salvarMeuVinculoAcao,
  salvarOrgao, salvarPapel,
  salvarPermissao, salvarPermissaoLote, salvarPessoa, salvarProcessoDisciplinar, salvarProjeto,
  salvarTurmaBatismoAcao,
  salvarVinculoFamiliar, selecionarOrgaoReunioes, solicitarCarta, solicitarCodigoAcessoAcao,
  solicitarJustificativaAcao,
  trocarMinhaSenha,
  verFrequencia, verificarCadeiaAuditoriaAcao,
  voltarBuscaPessoas, voltarParaCheckin,
  votarEnqueteAcao
});
