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
  setores: "Os 20 Setores Técnicos do Regimento (Art. 48 a 52): quem serve em cada um (candidatura, aprovação e Termo de Adesão) e os atos cautelares — a interdição de templo em risco, que vale na hora e a Diretoria ratifica ou revoga, e o pedido de remoção de postagem nas redes oficiais. Voluntariado profissional: ninguém recebe salário nem honorário.",
  "meupainel:setores": "Sua situação nos Setores Técnicos: candidate-se a um setor da sua profissão, leia e aceite o Termo de Adesão quando for aprovado(a) e saia quando quiser, sem penalidade. Quem serve em Engenharia ou Segurança pode interditar um templo em risco; quem serve em Comunicação pode pedir a remoção de uma postagem. O líder da congregação vê aqui os atos dela.",
  menores: "Ministério com menores (Lei 14.811/2024): quem serve com crianças e adolescentes precisa estar habilitado hoje. O painel mostra, por congregação, quem está apto, quem tem algo vencendo e quem está bloqueado e por quê; as ferramentas registram o aceite da política e a autorização do responsável em ficha de papel, confirmam a ficha cadastral e definem a faixa etária da equipe. A Diretoria também decide sobre as comunicações dos voluntários que respondem a processo criminal (Regimento Art. 133 §5º, V).",
  "meupainel:menores": "Se você serve (ou quer servir) com crianças e adolescentes: veja se está apto e o que falta, aceite a política de comunicação, confirme a sua ficha a cada 6 meses e, se responde a inquérito ou processo criminal, comunique a Diretoria (é um dever e não é punição). Se você é pai, mãe ou tutor de um menor, autorize ou revogue aqui o uso da imagem e da saúde dele(a) no crachá.",
  vistoria: "Termo de Vistoria de antecedentes (Art. 133 §5º), só da Diretoria Executiva e do Conselho de Ética: veja quem falta, lavre o Termo e solicite certidões. A certidão nunca sobe ao sistema: o navegador calcula o código (hash) do arquivo e só ele é enviado.",
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
    leitor.onload = () => resolve(String(leitor.result).split(",")[1] || "");
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
  // vD.4 — confirmação reforçada: 428 = "confirme de novo quem você é"; depois de confirmar, a mesma chamada é repetida UMA vez
  if (!opts.semFator) {
    const primeira = await fetchProtegido(url, Object.assign({}, opts, { semFator: true }));
    if (primeira.status !== 428) return primeira;
    const ok = await confirmarFatorAgora();
    if (!ok) return primeira;
    return fetchProtegido(url, Object.assign({}, opts, { semFator: true }));
  }
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

  // vD.4 — senha certa da liderança abre a SEGUNDA ETAPA (chave de acesso do aparelho ou código por e-mail), não a sessão
  if (data.segundoFator) { mostrarSegundoFator(data, matricula); return; }

  salvarSessao(data.token, data.nome, data.permissoes, matricula, data.nivel, data.escopo, data.geral);
  document.getElementById("senhaPainel").value = "";
  msg.textContent = "";
  if (data.avisoFator) mostrarToast(data.avisoFator, "erro");
  if (data.pinProvisorio) { mostrarCriarPin(); return; }          // entrou com o PIN que a Secretaria gerou: precisa criar o próprio
  if (data.termosPendentes && data.termosPendentes.length > 0) {
    await mostrarModalTermos(data.termosPendentes);
    return;
  }
  await abrirPainelConteudo(matricula);
}

// ---- vD.4 — segunda etapa do login da liderança: chave de acesso (passkey) com código por e-mail de reserva ----
// A senha certa devolve um bilhete de 5 minutos e diz a etapa ("chave" se a pessoa já cadastrou um aparelho, "codigo" se só
// tem e-mail). A chave é a biblioteca @simplewebauthn/browser (vendor/) chamando navigator.credentials; o servidor confere
// o desafio de uso único. Em caso de falha, a tela sempre oferece o código por e-mail.
let segundoFatorPendente = null; // { bilhete, matricula, opcoes, podeCodigo }
const temChaveDeAcessoNoNavegador = () => !!(window.SimpleWebAuthnBrowser && SimpleWebAuthnBrowser.browserSupportsWebAuthn());

function mostrarSegundoFator(data, matricula) {
  segundoFatorPendente = { bilhete: data.bilhete, matricula, opcoes: data.opcoes || null, podeCodigo: !!data.podeCodigo };
  const temChave = data.segundoFator === "chave";
  document.getElementById("cxSegundoFator").style.display = "block";
  document.getElementById("btnUsarChaveAcesso").style.display = temChave ? "" : "none";
  document.getElementById("cxCodigoFator").style.display = temChave ? "none" : "block";
  document.getElementById("linkCodigoFator").style.display = temChave && data.podeCodigo ? "" : "none";
  document.getElementById("codigoFatorInput").value = "";
  document.getElementById("segundoFatorTexto").textContent = temChave
    ? "Senha certa. Agora confirme com a chave de acesso deste aparelho (digital, rosto ou senha do aparelho)."
    : `Senha certa. Enviamos um código de 6 números para ${data.emailMascarado || "o e-mail do seu cadastro"}.${data.avisoCodigo ? " " + data.avisoCodigo : ""}`;
  document.getElementById("resultadoLogin").textContent = "";
  if (temChave) usarChaveAcessoAcao();   // já pede a chave na hora; o botão fica para repetir
  else document.getElementById("codigoFatorInput").focus();
}

async function usarChaveAcessoAcao() {
  const p = segundoFatorPendente;
  if (!p) return;
  const msg = document.getElementById("resultadoLogin");
  if (!temChaveDeAcessoNoNavegador()) { msg.textContent = "Este navegador não tem chave de acesso. Use o código por e-mail."; return; }
  try {
    let opcoes = p.opcoes;
    if (!opcoes) {
      const o = await postJsonSemSessao(`${API_BASE}/auth/segundo-fator/chave/opcoes`, { bilhete: p.bilhete });
      if (!o.sucesso) { msg.textContent = o.mensagem; return; }
      opcoes = o.opcoes;
    }
    p.opcoes = null;   // cada desafio vale uma vez
    const resposta = await SimpleWebAuthnBrowser.startAuthentication({ optionsJSON: opcoes });
    const data = await postJsonSemSessao(`${API_BASE}/auth/segundo-fator/chave`, { bilhete: p.bilhete, resposta });
    if (!data.sucesso) { msg.textContent = data.mensagem; return; }
    await concluirEntradaLideranca(data, p.matricula);
  } catch (e) {
    msg.textContent = /NotAllowed|Abort/i.test(String(e && e.name))
      ? "A confirmação foi cancelada no aparelho. Tente de novo ou use o código por e-mail."
      : "Não foi possível usar a chave de acesso neste aparelho. Use o código por e-mail.";
  }
}

async function pedirCodigoFatorAcao() {
  const p = segundoFatorPendente;
  if (!p) return;
  const data = await postJsonSemSessao(`${API_BASE}/auth/segundo-fator/codigo/enviar`, { bilhete: p.bilhete });
  document.getElementById("resultadoLogin").textContent = data.mensagem || (data.sucesso ? "Código enviado." : "Não foi possível enviar o código.");
  if (data.sucesso) { document.getElementById("cxCodigoFator").style.display = "block"; document.getElementById("codigoFatorInput").focus(); }
}

async function confirmarCodigoFatorAcao() {
  const p = segundoFatorPendente;
  if (!p) return;
  const msg = document.getElementById("resultadoLogin");
  const codigo = document.getElementById("codigoFatorInput").value.trim();
  if (!/^\d{6}$/.test(codigo)) { msg.textContent = "Digite os 6 números do código."; return; }
  const data = await postJsonSemSessao(`${API_BASE}/auth/segundo-fator/codigo`, { bilhete: p.bilhete, codigo });
  if (!data.sucesso) { msg.textContent = data.mensagem; return; }
  await concluirEntradaLideranca(data, p.matricula);
}

function cancelarSegundoFatorAcao() {
  segundoFatorPendente = null;
  document.getElementById("cxSegundoFator").style.display = "none";
  document.getElementById("resultadoLogin").textContent = "";
}

async function concluirEntradaLideranca(data, matricula) {
  segundoFatorPendente = null;
  document.getElementById("cxSegundoFator").style.display = "none";
  salvarSessao(data.token, data.nome, data.permissoes, matricula, data.nivel, data.escopo, data.geral);
  document.getElementById("senhaPainel").value = "";
  document.getElementById("resultadoLogin").textContent = "";
  if (data.termosPendentes && data.termosPendentes.length > 0) { await mostrarModalTermos(data.termosPendentes); return; }
  await abrirPainelConteudo(matricula);
}

// Confirmação reforçada (os quatro atos): a rota responde 428 quando a última confirmação passou de 10 minutos; aqui a pessoa
// confirma de novo (chave do aparelho ou código por e-mail), a sessão é reassinada com o carimbo novo e a chamada é repetida.
async function confirmarFatorAgora() {
  const cabecalhos = { "Content-Type": "application/json" };
  const chamar = (caminho, corpo) => fetchProtegido(`${API_BASE}/chaves-acesso/${caminho}`, { method: "POST", headers: cabecalhos, body: JSON.stringify(corpo || {}), semFator: true }).then((r) => r.json());
  let data = null;
  if (temChaveDeAcessoNoNavegador()) {
    const o = await chamar("confirmar/opcoes");
    if (o.sucesso) {
      try {
        const resposta = await SimpleWebAuthnBrowser.startAuthentication({ optionsJSON: o.opcoes });
        data = await chamar("confirmar", { resposta });
      } catch (_) { data = null; }
    }
  }
  if (!data || !data.sucesso) {
    const envio = await chamar("confirmar/codigo/enviar");
    if (!envio.sucesso) { mostrarToast(envio.mensagem || "Não foi possível confirmar. Cadastre uma chave de acesso em Meu Painel → Segurança.", "erro"); return false; }
    const codigo = await pedirTexto("Este ato exige confirmação. " + (envio.mensagem || "Enviamos um código ao seu e-mail.") + " Digite o código:", "6 números", "");
    if (!codigo) return false;
    data = await chamar("confirmar/codigo", { codigo: String(codigo).trim() });
    if (!data.sucesso) { mostrarToast(data.mensagem || "Código não confirmado.", "erro"); return false; }
  }
  authToken = data.token;
  sessionStorage.setItem("authToken", data.token);
  return true;
}

// Meu Painel → Segurança: as chaves de acesso da própria pessoa
async function carregarChavesAcesso() {
  const c = document.getElementById("resultadoChavesAcesso");
  if (!c) return;
  if (!authToken) { c.innerHTML = "<p class='subtitle'>Disponível só para quem entrou com senha de liderança.</p>"; return; }
  const res = await fetchProtegido(`${API_BASE}/chaves-acesso`, { semFator: true });
  if (res.status === 403) { c.innerHTML = "<p class='subtitle'>Chaves de acesso são da liderança (sessão com senha). O PIN do membro já é o fator dele.</p>"; return; }
  const data = await jsonDaTela(res, c, "lista");
  if (data === null) return;
  if (data.sucesso === false) { c.innerHTML = `<p class='subtitle'>${escaparHtmlEbd(data.mensagem || "")}</p>`; return; }
  const chaves = Array.isArray(data.chaves) ? data.chaves : [];
  const linhas = chaves.map((k) => `<tr>
      <td>${escaparHtmlEbd(k.apelido || "(sem nome)")}</td>
      <td>${k.criadoEm ? new Date(k.criadoEm).toLocaleDateString("pt-BR") : "—"}</td>
      <td>${k.ultimoUsoEm ? new Date(k.ultimoUsoEm).toLocaleString("pt-BR") : "nunca"}</td>
      <td class="acoes-inline"><button class="btn-link btn-link-perigo" data-on-click="removerChaveAcessoAcao" data-args-click="${argsAttr(Number(k.chaveId))}">Remover</button></td>
    </tr>`).join("");
  const tabela = linhas
    ? `<table class="tabela-frequencia"><thead><tr><th>Aparelho</th><th>Cadastrada em</th><th>Último uso</th><th></th></tr></thead><tbody>${linhas}</tbody></table>`
    : `<p class='subtitle'>Nenhuma chave cadastrada ainda. Enquanto não houver, a confirmação vai por código no e-mail${data.emailMascarado ? ` (${escaparHtmlEbd(data.emailMascarado)})` : " — e a sua matrícula não tem e-mail cadastrado: peça à Secretaria Geral"}.</p>`;
  const botao = temChaveDeAcessoNoNavegador()
    ? `<button class="btn-confirmar" type="button" data-on-click="cadastrarChaveAcessoAcao">🔑 Cadastrar este aparelho</button>`
    : "<span class='subtitle'>Este navegador não oferece chave de acesso; tente no celular ou num navegador atual.</span>";
  c.innerHTML = `${tabela}<p style="margin-top:8px;">${botao}</p>`;
}

async function cadastrarChaveAcessoAcao() {
  const apelido = await pedirTexto("Dê um nome a este aparelho (ex.: Celular da Maria):", "Nome do aparelho", "");
  if (apelido === null || apelido === undefined) return;
  const cabecalhos = { "Content-Type": "application/json" };
  const o = await (await fetchProtegido(`${API_BASE}/chaves-acesso/registrar/opcoes`, { method: "POST", headers: cabecalhos, body: "{}", semFator: true })).json();
  if (!o.sucesso) { mostrarToast(o.mensagem || "Não foi possível iniciar o cadastro.", "erro"); return; }
  let resposta;
  try { resposta = await SimpleWebAuthnBrowser.startRegistration({ optionsJSON: o.opcoes }); }
  catch (e) {
    mostrarToast(/InvalidState/i.test(String(e && e.name)) ? "Este aparelho já tem uma chave cadastrada para a sua matrícula." : "O cadastro foi cancelado ou o aparelho não respondeu.", "erro");
    return;
  }
  const r = await (await fetchProtegido(`${API_BASE}/chaves-acesso/registrar`, { method: "POST", headers: cabecalhos, body: JSON.stringify({ resposta, apelido: String(apelido).trim() }), semFator: true })).json();
  mostrarToast(r.mensagem || (r.sucesso ? "Chave cadastrada." : "Não foi possível cadastrar."), r.sucesso ? "sucesso" : "erro");
  if (r.sucesso) carregarChavesAcesso();
}

async function removerChaveAcessoAcao(chaveId) {
  if (!(await confirmarAcao("Remover esta chave de acesso? Este aparelho deixa de confirmar a sua entrada.", "Remover"))) return;
  const r = await (await fetchProtegido(`${API_BASE}/chaves-acesso/remover`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ chaveId: Number(chaveId) }), semFator: true })).json();
  mostrarToast(r.mensagem || "", r.sucesso ? "sucesso" : "erro");
  if (r.sucesso) carregarChavesAcesso();
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
const NOMES_ABAS = ["meupainel", "financeiro", "reunioes", "pessoas", "cartas", "orgaos", "estrutura", "catalogos", "permissoes", "consagracoes", "enquetes", "arquivos", "disciplina", "abandono", "auditoria", "protecaodedados", "ouvidoria", "documentos", "mediacao", "relatoriosdepto", "escalas", "habilitacao", "menores", "assistenciasocial", "ebd", "conquistas", "trilhas", "psc", "calendario", "canais", "eventos", "setores", "vistoria"];

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
  // v7.7 — Ministério com Menores (Lei 14.811/2024): a MESMA permissão da Habilitação, no escopo da congregação (painel e ferramentas), mais a da Vistoria, para a Diretoria e o
  // Conselho de Ética chegarem às comunicações dos voluntários (o campo inteiro é só do nível geral; o servidor confere cada ação e a tela mostra só as seções que ele libera).
  // A situação de quem serve com menores fica em Meu Painel → Ministério com menores, aberta a qualquer login.
  menores: ["habilitacao_voluntarios", "vistoria_antecedentes"],
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
  // v7.6 — Setores Técnicos (Regimento Art. 48 a 52) e Vistoria de Antecedentes (Art. 133 §5º): três permissões próprias, nunca
  // concedidas por padrão (vêm só para a Diretoria Executiva; o Conselho de Ética recebe "vistoria_antecedentes" em Permissões).
  // "setores_tecnicos" administra catálogo, vínculos e Termo; "setores_ratificacao" (Diretoria) ratifica ou revoga os atos
  // cautelares; qualquer uma libera a aba "Setores Técnicos". O servidor só atende o nível GERAL nas três (ver ABAS_SO_DO_GERAL).
  // A candidatura, o aceite do Termo e os atos de quem serve ficam em Meu Painel → Setores Técnicos, abertos a qualquer login.
  setores: ["setores_tecnicos", "setores_ratificacao"],
  vistoria: ["vistoria_antecedentes"],
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
const ABAS_SO_DO_GERAL = new Set(["catalogos", "permissoes", "auditoria", "protecaodedados", "setores", "vistoria"]);
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
  habilitacao: { titulo: "Habilitação de Voluntários", icone: "🛡️", abaEntrada: "habilitacao", abas: ["habilitacao", "menores"] },
  assistenciasocial: { titulo: "Assistência Social", icone: "🤝", abaEntrada: "assistenciasocial", abas: ["assistenciasocial"] },
  ebd: { titulo: "EBD (Escola Bíblica Dominical)", icone: "📖", abaEntrada: "ebd", abas: ["ebd"] },
  conquistas: { titulo: "Conquistas e Gamificação", icone: "🏆", abaEntrada: "conquistas", abas: ["conquistas"] },
  trilhas: { titulo: "Formação e Certificação", icone: "🎓", abaEntrada: "trilhas", abas: ["trilhas"] },
  psc: { titulo: "Saúde Congregacional (PSC)", icone: "🩺", abaEntrada: "psc", abas: ["psc"] },
  calendario: { titulo: "Calendário Oficial", icone: "📅", abaEntrada: "calendario", abas: ["calendario"] },
  canais: { titulo: "Canais e Comunicação", icone: "📣", abaEntrada: "canais", abas: ["canais"] },
  eventos: { titulo: "Eventos e Congressos", icone: "🎪", abaEntrada: "eventos", abas: ["eventos"] },
  setores: { titulo: "Setores Técnicos", icone: "🧑‍⚕️", abaEntrada: "setores", abas: ["setores", "vistoria"] },
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
const SUB_ABAS_MEUPAINEL = ["perfil", "dados", "vinculos", "contribuicoes", "lgpd", "cartas", "minhasescalas", "minhahabilitacao", "menores", "minhasconquistas", "minhaformacao", "agenda", "canais", "eventos", "setores", "tarefas", "seguranca"];
const TITULOS_SUB_MEUPAINEL = {
  perfil: "Meu Perfil", dados: "Meus Dados Cadastrais", vinculos: "Vínculos Familiares",
  contribuicoes: "Minhas Contribuições", lgpd: "Meus Dados (LGPD)", cartas: "Cartas de Trânsito",
  minhasescalas: "Minhas Escalas", minhahabilitacao: "Minha Habilitação", menores: "Ministério com menores", minhasconquistas: "Minhas Conquistas", minhaformacao: "Minha Formação", agenda: "Agenda", canais: "Canais", eventos: "Eventos", setores: "Setores Técnicos",
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
  if (sub === "menores") carregarMeuPainelMenoresAcao();
  if (sub === "minhasconquistas") carregarMinhasConquistasAcao();
  if (sub === "minhaformacao") carregarMinhaFormacaoAcao();
  if (sub === "agenda") carregarMinhaAgendaCalAcao();
  if (sub === "canais") carregarMeuPainelCanaisAcao();
  if (sub === "eventos") carregarMeuPainelEventosAcao();
  if (sub === "setores") carregarMeuPainelSetoresAcao();
  if (sub === "tarefas") { filtrarMinhasTarefas(filtroMinhasTarefasAtual); carregarMinhasMediacoesAcao(); }
  if (sub === "perfil") carregarPainelInicial();
  if (sub === "seguranca") { carregarMinhasSessoes(); carregarChavesAcesso(); carregarDelegacoes(); }
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
  usarChaveAcessoAcao, pedirCodigoFatorAcao, confirmarCodigoFatorAcao, cancelarSegundoFatorAcao, cadastrarChaveAcessoAcao, removerChaveAcessoAcao,
  abrirModalAnexos, abrirNotificacao,
  acaoMinhaTarefa, acessarPainel,
  alterarMeuPinAcao, alternarAjudaContextual,
  alternarLoginPorCodigo, alternarModoLeitura, alternarPainelNotificacoes, alternarPushAcao,
  arquivarNotificacao,
  ativarComTeclado,
  cancelarDelegacaoAcao,
  confirmarCodigoAcessoAcao,
  criarDelegacaoAcao,
  criarPinAcao,
  encerrarSessaoAcao, entrarModulo, enviarAnexoModal,
  enviarPresenca,
  excluirAnexoModal,
  fecharModal, fecharPrimeiroAcesso,
  filtrarMinhasTarefas,
  gerarPinProvisorioAcao,
  instalarAppAcao, irParaBlocoPainel, irParaResultadoBusca,
  marcarTodasNotificacoesLidas,
  mostrarSubAbaMeupainel, mostrarTelaPainelInicial,
  onDigitarBuscaGlobal,
  registrarAutolancamentoAcao,
  sairDoModulo, sairDoPainel,
  solicitarCodigoAcessoAcao,
  trocarMinhaSenha,
  voltarParaCheckin
});
