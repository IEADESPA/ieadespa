// app/modulos/checkin-infantil.js — v7.10: Check-in infantil com cadeia de custódia (ECA arts. 70 e 70-A; Lei 14.811/2024; LGPD arts. 11 e 14).
// Script clássico, carregado pelo index.html DEPOIS do script.js e do eventos.js: compartilha o escopo global com eles. As ações que o HTML pede deste módulo são
// registradas aqui mesmo, no fim do arquivo (registrarAcoes mescla). Todos os nomes de nível superior começam com "chk"/"CHK_" (scripts clássicos dividem um só escopo).
//
// Três telas sobre uma rota do servidor (GestaoCheckinInfantil: /api/checkin-infantil/*), prefixo "chk":
//   1) Meu Painel → Check-in infantil (qualquer login, inclusive PIN): "Minhas salas de hoje" (as que a pessoa opera) e "Meus filhos" (o responsável vê o histórico dos
//      próprios filhos, cuida da lista de quem pode retirar e da alergia/condição de saúde; NUNCA faz o check-in por aqui);
//   2) aba "Check-in infantil" (permissão habilitacao_voluntarios): as salas de hoje do escopo, as aprovações de retirada divergente e as fichas assinadas;
//   3) a TELA DA SALA (usada pelas duas anteriores, no celular da equipe): cabeçalho com a janela do check-in, lotação, voluntários presentes, check-in (membro ou visitante),
//      etiqueta e recibo com o código, "Na sala" com retirada, segunda via (dois olhares), pendências e, na visão de gestão, decidir retirada divergente, destravar,
//      tirar voluntário da sala e o relatório do dia. A tela atualiza sozinha a cada ~8 s enquanto está aberta e visível.
// Toda regra (janela, lotação, quem pode retirar, código, divergência) mora no servidor (shared/checkinInfantil.js e shared/checkinInfantilDb.js): aqui só se monta o que ele
// devolve e se manda o que a pessoa fez; recusa de regra vem como 422 { mensagem } e é mostrada tal qual, sem limpar o formulário. 409 = "o registro mudou": a sala é
// recarregada. 428 = confirmação reforçada: o fetchProtegido já a trata e repete a chamada uma vez.
// PRIVACIDADE (cada item já custou um defeito em versões passadas): o CÓDIGO de retirada só existe na resposta do check-in e da segunda via; fica apenas em memória e só no painel
// de impressão, e sai do DOM e das variáveis ao fechar o painel, ao sair da sala, ao trocar de tela e ao trocar de login — nunca em localStorage, sessionStorage, endereço nem
// console. Nome de criança, saúde e código entram na tela só por textContent; o resto que vem do servidor passa por escaparHtmlEbd; as ações do HTML recebem só id numérico ou
// constante nossa (data-args por argsAttr).
const CHK_ROTA = "checkin-infantil";
const CHK_INTERVALO_MS = 8000;                  // a sala se atualiza sozinha a cada ~8 s
const CHK_MS_BUSCA = 350;                       // espera depois da última letra digitada antes de buscar a criança
const CHK_MAX_FALHAS = 3;                       // falhas seguidas ao atualizar: o relógio para e a pessoa toca em "Atualizar"
const CHK_MAX_CRIANCAS_PADRAO = 6;
const CHK_MAX_VISITA = 3;
const CHK_MAX_SAUDE = 400;
const CHK_MIN_MOTIVO = 8, CHK_MAX_MOTIVO = 300;
const CHK_MAX_REFERENCIA = 200;
const CHK_MAX_AUTORIZADOS_PADRAO = 8;
const CHK_OUTRA = "OUTRA";                      // valor da opção "outra pessoa" nos campos de escolha (quem trouxe, quem retira)
const CHK_CTX = ["Meu", "Ges"];                 // onde a sala está aberta: Meu Painel ou a aba da liderança (só estas constantes entram em id e argumento)
const CHK_PFX = ["Fh", "Fi"];                   // o painel da criança: Meus filhos (Fh) ou a ficha assinada da liderança (Fi)
const CHK_SECOES = ["salas", "aprovacoes", "fichas"];
const CHK_SECOES_FILHO = ["hist", "aut", "sau"];
const CHK_MSG_FATOR = "Este ato precisa de uma confirmação recente de quem você é (chave de acesso ou código por e-mail). Tente de novo e confirme quando a tela pedir.";
const CHK_MSG_SEM_CATALOGO = "Não foi possível carregar as opções do check-in agora. Verifique a internet e toque em Atualizar.";
const CHK_CLASSE_SELO = { ok: "cal-st-homologado", atencao: "cal-st-proposto", erro: "cal-st-indeferido", neutro: "cal-st-cancelado", info: "cal-st-deferido" };
const CHK_FORMA_AUTORIZADO = { RESPONSAVEL: "cadastrado pelo responsável", FICHA_FISICA: "ficha assinada, registrada pela Secretaria" };
const CHK_ROTULO_TIPO_RETIRANTE = { RESPONSAVEL: "responsável cadastrado", AUTORIZADO: "pessoa autorizada", TROUXE: "quem trouxe", OUTRO: "outra pessoa" };
const CHK_ROTULO_SECAO = { salas: "Salas de hoje", aprovacoes: "Aprovações", fichas: "Fichas assinadas" };

let chkDono = null;                // matrícula + tipo de sessão de quem a tela foi montada (não vaza dado ao trocar de login)
let chkCatalogos = null;           // GET catalogos (parentescos, documentos, faixas, texto da saúde, limites)
let chkGeracao = 0;                // sobe a cada limpeza da tela (troca de login, saída): um pedido que ia gravar de outra "geração" não mexe na tela de agora
let chkSala = null;                // a sala aberta: { servicoId, equipeId, ctx, ehMinha, ehGestao, gatilhoId }
let chkSnap = null;                // o último GET sala (o que a tela mostra; nunca guarda o código)
let chkAssinatura = "";            // assinatura do último snapshot: a lista só é refeita se algo mudou (sem piscar nem roubar o foco)
let chkAcao = null;                // o painel de ação aberto: { tipo: "retirada" | "segundavia", registroId }
let chkGatilhoForm = null;         // o id do botão que abriu o painel de ação (o foco volta para ele)
let chkCi = null;                  // o formulário de check-in: { criancas: [...], resultados: [...] }
let chkImpressao = null;           // { lotes: [{ tipo, etiquetas, recibo }], impressa } — o código só mora aqui (e no painel de impressão)
let chkSalasMeu = [], chkSalasGes = [];          // GET minhas-salas (as entradas, para abrir a sala)
let chkAprovacoes = [];            // [{ sala, crianca }] — o que espera a liderança (retirada divergente e criança travada)
let chkSecaoAtual = "salas";
let chkTimer = null;               // setInterval da atualização: só existe com a tela aberta e visível; nunca dois
let chkTimerBusca = null;          // setTimeout da busca de criança (espera o fim da digitação)
let chkFalhas = 0;
let chkEmVoo = 0;                  // leituras da sala a caminho (o relógio não empilha pedidos)
let chkSeqSala = 0, chkSeqLeitura = 0, chkSeqMeu = 0, chkSeqGes = 0, chkSeqBusca = 0, chkSeqResp = 0, chkSeqApr = 0, chkSeqFicha = 0, chkSeqRel = 0;
const chkEmCurso = new Set();      // trava duplo clique nas ações que gravam

// ---- utilidades ----
function chkEl(id) { return document.getElementById(id); }
function chkTexto(id) { const c = chkEl(id); return c ? String(c.value == null ? "" : c.value).trim() : ""; }
// identificador digitado: inteiro maior que zero escrito só com algarismos, ou 0
function chkInteiro(texto) { const t = String(texto == null ? "" : texto).trim(); return /^\d{1,10}$/.test(t) && Number(t) >= 1 ? Number(t) : 0; }
function chkMsgErro(data) { return (data && data.mensagem) || "Não foi possível concluir a operação agora."; }
function chkTemMarca(texto) { return /[<>]/.test(texto); }
function chkEspacos(texto) { return String(texto == null ? "" : texto).trim().replace(/\s+/g, " "); }
function chkMeuId() { return Number(authMatricula) || 0; }
function chkCtxValido(bruto) { return bruto === "Ges" ? "Ges" : "Meu"; }
function chkPfxValido(bruto) { return bruto === "Fi" ? "Fi" : "Fh"; }
function chkSecaoFilhoValida(bruto) { return CHK_SECOES_FILHO.includes(bruto) ? bruto : ""; }
function chkRolarPara(id) { const el = chkEl(id); if (el && typeof el.scrollIntoView === "function") el.scrollIntoView({ behavior: "smooth", block: "start" }); }
// Foco (teclado e leitor de tela): vai para o que acabou de abrir (título da sala, primeiro campo do formulário, painel das etiquetas) e volta ao botão de onde a pessoa saiu.
function chkFocar(el) {
  if (!el || typeof el.focus !== "function") return;
  try { el.focus({ preventScroll: true }); } catch { el.focus(); }
}
function chkFocarId(id) { chkFocar(chkEl(id)); }
// Os modais (confirmarAcao e pedirTexto) somem ao fechar e levam o foco junto: depois da resposta o foco volta ao botão de onde a pessoa saiu, se ele ainda está na tela (teclado e leitor de tela).
// (o botão é procurado pelo id: a lista pode ter sido refeita enquanto o modal estava aberto, e o botão de antes já não está na árvore; o novo, com o mesmo id, está)
function chkVoltarFoco(origem) {
  const id = typeof origem === "string" ? origem : (origem && typeof origem === "object" ? origem.id : "");
  const el = id ? chkEl(id) : (origem && typeof origem === "object" ? origem : null);
  if (el && typeof el === "object" && el.isConnected) chkFocar(el);
}
function chkFocoPerdido() { return !document.activeElement || document.activeElement === document.body; }
async function chkPerguntar(mensagem, rotulo, origem) {
  const sim = await confirmarAcao(mensagem, rotulo);
  chkVoltarFoco(origem);
  return sim;
}
function chkEscrever(id, texto, destaque) {
  const el = chkEl(id);
  if (el) { el.textContent = texto; el.className = destaque ? "subtitle psc-aviso" : "subtitle"; }
}
async function chkProtegerBotao(botao, tarefa, chave) {
  if (chave) {
    if (chkEmCurso.has(chave)) { mostrarToast("Aguarde: o pedido anterior ainda está sendo processado.", "erro"); return undefined; }
    chkEmCurso.add(chave);
  }
  // desabilitar o botão que tem o foco faz o navegador tirar o foco dele (regra de "focus fixup"): quem usa teclado ou leitor de tela volta ao mesmo botão quando o pedido termina
  const tinhaFoco = !!botao && document.activeElement === botao;
  if (botao) botao.disabled = true;
  try { return await tarefa(); } finally {
    if (botao) botao.disabled = false;
    if (chave) chkEmCurso.delete(chave);
    if (tinhaFoco && chkFocoPerdido()) {   // só quando o foco se perdeu: um ato que levou o foco a outro lugar de propósito fica como está
      chkVoltarFoco(botao);
      // o botão saiu da tela (a criança foi retirada, a lista foi refeita): o foco não fica no corpo da página
      if (chkFocoPerdido()) chkFocarId(chkSala ? "chkSalaTitulo" : (chkVisivel("chkSecaoAprovacoes") ? "btnChkSecaoAprovacoes" : ""));
    }
  }
}
function chkSelo(classe, rotulo) { return `<span class="cal-selo chk-selo ${escaparHtmlEbd(classe)}">${escaparHtmlEbd(rotulo)}</span>`; }
function chkCampo(rotulo, html) { return html ? `<div><dt>${rotulo}</dt><dd>${html}</dd></div>` : ""; }
function chkOpcoes(lista, valor, rotulo, placeholder) {
  return (placeholder != null ? `<option value="">${escaparHtmlEbd(placeholder)}</option>` : "")
    + lista.map(x => `<option value="${escaparHtmlEbd(valor(x))}">${escaparHtmlEbd(rotulo(x))}</option>`).join("");
}
function chkNo(tag, classe, texto, filhos) {
  const el = document.createElement(tag);
  if (classe) el.className = classe;
  if (texto != null) el.textContent = String(texto);
  (filhos || []).forEach(f => { if (f) el.appendChild(f); });
  return el;
}
function chkRotuloDe(lista, codigo) {
  const achado = (lista || []).find(x => x && x.codigo === codigo);
  return achado ? String(achado.rotulo) : String(codigo == null ? "" : codigo);
}
function chkRotuloParentesco(codigo) { return codigo ? chkRotuloDe(chkCatalogos ? chkCatalogos.parentescos : [], codigo) : ""; }
function chkRotuloFaixa(codigo) { return codigo ? chkRotuloDe(chkCatalogos ? chkCatalogos.faixas : [], codigo) : ""; }
function chkRotuloDocumento(codigo) { return codigo ? chkRotuloDe(chkCatalogos ? chkCatalogos.documentos : [], codigo) : ""; }
function chkAnos(n) { const v = Number(n); return Number.isFinite(v) ? `${v} ${v === 1 ? "ano" : "anos"}` : ""; }
// A hora do serviço é "de parede" (a hora que a congregação vive, gravada como se fosse UTC): só se fatia o texto. Os atos (entrada, retirada...) são instantes de verdade: hora de Brasília.
function chkHoraServico(valor) { const m = /T(\d{2}:\d{2})/.exec(String(valor == null ? "" : valor)); return m ? m[1] : "—"; }
function chkHoraInstante(valor) {
  const d = new Date(valor);
  if (!valor || Number.isNaN(d.getTime())) return "—";
  return d.toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" });
}
function chkDataHoraServico(valor) { return `${formatarDataEbd(String(valor == null ? "" : valor).slice(0, 10))} às ${escaparHtmlEbd(chkHoraServico(valor))}`; }
// telefone: o endereço tel: leva só os algarismos; o texto mostrado é o que o servidor mandou
function chkHtmlTelefone(valor) {
  const texto = String(valor == null ? "" : valor).trim();
  const digitos = texto.replace(/\D/g, "").slice(0, 13);
  if (!texto) return "<span class='psc-legenda'>sem telefone cadastrado</span>";
  return digitos.length >= 8 ? `<a class="chk-tel" href="${urlSegura(`tel:${digitos}`)}">📞 ${escaparHtmlEbd(texto)}</a>` : escaparHtmlEbd(texto);
}

// ---- chamadas à API (nunca lançam: erro de rede ou resposta que não é JSON viram { sucesso:false, mensagem }) ----
// Tempo-limite de cada pedido (rede ruim, celular que dormiu): sem ele um pedido pendurado deixava a sala sem atualizar para sempre. `AbortSignal.timeout` não existe em navegador muito velho: sem ele, segue como antes.
const CHK_TEMPO_LIMITE_MS = 20000;
async function chkRequisitar(caminho, opcoes) {
  try {
    const comPrazo = Object.assign({}, opcoes || {});
    if (typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function") comPrazo.signal = AbortSignal.timeout(CHK_TEMPO_LIMITE_MS);
    const res = await fetchProtegido(`${API_BASE}/${CHK_ROTA}/${caminho}`, comPrazo);
    let corpo = null;
    try { corpo = await res.json(); } catch { /* sem JSON */ }
    if (!corpo || typeof corpo !== "object" || Array.isArray(corpo)) return { sucesso: false, mensagem: `Resposta inesperada do servidor (${res.status}).`, httpStatus: res.status };
    if (res.status >= 400) corpo.sucesso = false;
    // 428: a confirmação reforçada (chave de acesso ou código por e-mail) não foi concluída; o fetchProtegido já tentou uma vez
    if (res.status === 428 || corpo.precisaFator) corpo.mensagem = CHK_MSG_FATOR;
    corpo.httpStatus = res.status;
    // 403 e erro de servidor (5xx) o fetchProtegido já avisou com um toast; repetir o toast deixaria dois iguais na tela
    if (res.status === 403 || res.status >= 500) corpo.jaAvisado = true;
    return corpo;
  } catch (e) {
    // falha de rede e sessão expirada já foram avisadas por fetchProtegido (toast): aqui só vai o texto para a tela, sem outro toast
    if (e && e.message === "Sessão expirada") return { sucesso: false, jaAvisado: true, sessaoExpirada: true, mensagem: "Sua sessão expirou. Entre novamente." };
    return { sucesso: false, jaAvisado: true, falhaDeRede: true, mensagem: "Não foi possível falar com o servidor agora. Verifique a internet e tente de novo." };
  }
}
function chkObter(caminho) { return chkRequisitar(caminho); }
function chkPostar(caminho, corpo) {
  return chkRequisitar(caminho, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo) });
}
// a sala vai sempre como par de números na consulta
function chkConsultaSala(sala, extra) { return `servicoId=${Number(sala.servicoId)}&equipeId=${Number(sala.equipeId)}${extra || ""}`; }
// Toast + texto fixo na tela (textContent: nada de HTML aqui). Quando o fetchProtegido já avisou (rede, sessão, 403, 5xx), só o texto vai para a tela.
function chkMostrarResultado(data, idMensagem, destaque) {
  const texto = chkMsgErro(data);
  if (!(data && data.jaAvisado)) mostrarToast(texto, data && data.sucesso === false ? "erro" : "sucesso");
  chkEscrever(idMensagem, texto, destaque || !!(data && data.sucesso === false));
}

async function chkGarantirCatalogos(forcar) {
  if (chkCatalogos && !forcar) return chkCatalogos;
  const geracao = chkGeracao;
  const data = await chkObter("catalogos");
  if (geracao !== chkGeracao) return chkCatalogos;   // a pessoa trocou de login enquanto o catálogo vinha: o dela é outro
  // falha ao recarregar com a sala aberta (rede, 5xx): o catálogo que a tela já tinha continua valendo — zerá-lo deixava o formulário do check-in morto até sair e entrar na sala
  if (data.sucesso === false) { if (!forcar) chkCatalogos = null; return chkCatalogos; }
  const lista = (v) => (Array.isArray(v) ? v.filter(x => x && typeof x === "object" && typeof x.codigo === "string") : []);
  const t = data.textoSaude && typeof data.textoSaude === "object" ? data.textoSaude : null;
  chkCatalogos = {
    parentescos: lista(data.parentescos), documentos: lista(data.documentos), faixas: lista(data.faixas),
    textoSaude: t ? { versao: t.versao, titulo: String(t.titulo || ""), itens: (Array.isArray(t.itens) ? t.itens : []).map(i => String(i && typeof i === "object" ? i.texto : i)), aceite: String(t.aceite || ""), hash: String(t.hash || "") } : null,
    tentativas: Number(data.tentativas) || 5, segundaViaMinutos: Number(data.segundaViaMinutos) || 10,
    maxAutorizados: Number(data.maxAutorizados) || CHK_MAX_AUTORIZADOS_PADRAO, maxCriancas: Number(data.maxCriancasPorCheckin) || CHK_MAX_CRIANCAS_PADRAO,
    papeis: { gestao: !!(data.papeis && data.papeis.gestao) }
  };
  return chkCatalogos;
}

// ---- troca de login: não deixa o dado da pessoa anterior na tela ----
const CHK_IDS_LISTAS = ["chkMeuSalasLista", "chkSalaMeu", "chkFilhosLista", "chkGesSalasLista", "chkSalaGes", "chkAprovacoesLista", "chkFichaCx"];
const CHK_IDS_MENSAGENS = ["chkMeuMsg", "chkGesMsg", "chkAprMsg", "chkFichaMsg"];
const CHK_IDS_CAMPOS = ["chkFiMatricula"];
function chkPararTimer() { if (chkTimer != null) { clearInterval(chkTimer); chkTimer = null; } }
function chkPararBusca() { if (chkTimerBusca != null) { clearTimeout(chkTimerBusca); chkTimerBusca = null; } }
function chkLimparImpressaoDaPagina() {
  const classes = document.body && document.body.classList;
  if (classes) classes.remove("chk-imprimindo", "chk-imp-etiquetas", "chk-imp-relatorio");
}
// Apaga tudo o que é da sala e das crianças (inclusive o código, que só existe em memória): ao sair da sessão, ao trocar de login e quando a navegação leva a pessoa para outra tela.
function chkLimparTela() {
  chkGeracao++;
  chkPararTimer(); chkPararBusca();
  chkCatalogos = null; chkSala = null; chkSnap = null; chkAssinatura = ""; chkAcao = null; chkGatilhoForm = null; chkCi = null; chkImpressao = null;
  chkSalasMeu = []; chkSalasGes = []; chkAprovacoes = []; chkSecaoAtual = "salas"; chkFalhas = 0; chkEmVoo = 0;
  // pedidos que ainda estão a caminho trazem dado do login anterior: a resposta velha é descartada
  chkSeqSala++; chkSeqLeitura++; chkSeqMeu++; chkSeqGes++; chkSeqBusca++; chkSeqResp++; chkSeqApr++; chkSeqFicha++; chkSeqRel++;
  chkEmCurso.clear();
  CHK_IDS_LISTAS.forEach(id => { const el = chkEl(id); if (el) el.innerHTML = ""; });
  CHK_IDS_MENSAGENS.forEach(id => { const el = chkEl(id); if (el) { el.textContent = ""; el.className = "subtitle"; } });
  CHK_IDS_CAMPOS.forEach(id => { const el = chkEl(id); if (el) el.value = ""; });
  chkMostrarListas("Meu", true); chkMostrarListas("Ges", true);
  chkLimparImpressaoDaPagina();
  chkAplicarSecaoGestao("salas");
}
// De quem é a tela: a matrícula E o tipo de sessão (senha de liderança × PIN): quem entra por PIN e depois por senha tem outros papéis.
function chkChaveDoDono() { return `${authMatricula}|${sessaoDeLiderancaNaTela() ? "senha" : "pin"}`; }
function chkVerificarDono() {
  if (chkDono !== chkChaveDoDono()) { chkLimparTela(); chkDono = chkChaveDoDono(); }
}
function chkPodeAba() { return authPermissoes.includes("habilitacao_voluntarios"); }

// Mostra a lista de salas (ou a esconde, quando a sala está aberta no lugar dela) do contexto.
function chkMostrarListas(ctx, mostrar) {
  const listas = chkEl(ctx === "Ges" ? "chkGesListas" : "chkMeuListas");
  if (listas) listas.style.display = mostrar ? "" : "none";
  const sala = chkEl(`chkSala${ctx}`);
  if (sala) sala.style.display = mostrar ? "none" : "";
}
// A sala (e tudo o que a acompanha) sai da tela e da memória.
function chkFecharSalaInterno() {
  const ctx = chkSala ? chkSala.ctx : null;
  chkPararTimer(); chkPararBusca();
  chkSeqSala++; chkSeqLeitura++; chkSeqBusca++; chkSeqResp++; chkSeqRel++;
  chkSala = null; chkSnap = null; chkAssinatura = ""; chkAcao = null; chkGatilhoForm = null; chkCi = null; chkImpressao = null; chkFalhas = 0; chkEmVoo = 0;
  chkEmCurso.clear();
  chkLimparImpressaoDaPagina();
  ["chkSalaMeu", "chkSalaGes"].forEach(id => { const el = chkEl(id); if (el) el.innerHTML = ""; });
  if (ctx) chkMostrarListas(ctx, true);
}
// Chamadas pela navegação (meus-dados.js e script.js): a sala, as listas e as fichas não ficam para trás quando a pessoa vai para outra tela.
function chkAbaMudou(aba) {
  if (aba !== "checkininfantil") chkFecharContexto("Ges");
  if (aba !== "meupainel") chkFecharContexto("Meu");
  if (aba !== "checkininfantil") chkSairDasFichas();
}
function chkSubAbaMudou(sub) {
  if (sub !== "checkininfantil") chkFecharContexto("Meu");
}
function chkFecharContexto(ctx) {
  if (chkSala && chkSala.ctx === ctx) chkFecharSalaInterno();
  chkSeqSala++;
  const ids = ctx === "Ges" ? ["chkGesSalasLista", "chkAprovacoesLista", "chkSalaGes"] : ["chkMeuSalasLista", "chkFilhosLista", "chkSalaMeu"];
  ids.forEach(id => { const el = chkEl(id); if (el) el.innerHTML = ""; });
  // (quem chama já está saindo da aba: a navegação avisa o módulo ANTES de esconder a aba, então não adianta perguntar o que está à vista — sem sala aberta, o relógio da fila para agora)
  if (ctx === "Ges") { chkAprovacoes = []; chkSalasGes = []; chkSeqGes++; chkSeqApr++; if (!chkSala) chkPararTimer(); } else { chkSalasMeu = []; chkSeqMeu++; }
  chkMostrarListas(ctx, true);
}
function chkSairDasFichas() {
  chkSeqFicha++;
  const cx = chkEl("chkFichaCx"); if (cx) cx.innerHTML = "";
  const msg = chkEl("chkFichaMsg"); if (msg) { msg.textContent = ""; msg.className = "subtitle"; }
  const campo = chkEl("chkFiMatricula"); if (campo) campo.value = "";
}

// ============================================================================
// O RELÓGIO DE ATUALIZAÇÃO (a sala, e a fila de aprovações, se refazem a cada ~8 s enquanto a tela está aberta e visível; nunca dois intervalos)
// ============================================================================
// à vista = o elemento e todos os que o contêm estão sem display:none (a tela some inteira quando o painel é escondido, sem que a aba tenha mudado de estado)
function chkVisivel(id) {
  const el = chkEl(id);
  if (!el) return false;
  for (let p = el; p && p.nodeType === 1; p = p.parentNode) if (p.style && p.style.display === "none") return false;
  return true;
}
// o lugar onde a sala está aberta continua na tela?
function chkContextoVisivel(ctx) {
  return ctx === "Ges" ? chkVisivel("abaCheckininfantil") : chkVisivel("abaMeupainel") && chkVisivel("subMeupainelCheckininfantil");
}
function chkAprovacoesVisiveis() { return !chkSala && chkVisivel("abaCheckininfantil") && chkSecaoAtual === "aprovacoes" && chkVisivel("chkSecaoAprovacoes"); }
function chkTemOQueAtualizar() { return !!chkSala || chkAprovacoesVisiveis(); }
function chkPaginaOculta() { return document.visibilityState === "hidden"; }
function chkIniciarTimer() { if (chkTimer == null && !chkPaginaOculta()) chkTimer = setInterval(chkTique, CHK_INTERVALO_MS); }
function chkPararTimerSeOciosa() { if (!chkTemOQueAtualizar()) chkPararTimer(); }
function chkTique() {
  if (!authToken || chkDono !== chkChaveDoDono()) { chkPararTimer(); return; }
  if (chkPaginaOculta()) { chkPararTimer(); return; }
  if (chkSala) {
    if (!chkContextoVisivel(chkSala.ctx)) { chkFecharSalaInterno(); return; }   // a pessoa foi para outra tela: a sala (e o código) saem
    chkLerSala(false);
    return;
  }
  if (chkAprovacoesVisiveis()) { chkCarregarAprovacoes(true); return; }
  chkPararTimer();
}
// Ao voltar para o navegador (celular que dormiu, outra aba), a sala é refeita NA HORA e o relógio volta; escondida, o relógio para (e nada é pedido ao servidor à toa).
function chkVisibilidadeMudou() {
  if (chkPaginaOculta()) { chkPararTimer(); return; }
  if (!authToken || !chkTemOQueAtualizar()) return;
  if (chkDono !== chkChaveDoDono()) return;
  chkTique();
  chkIniciarTimer();
}
document.addEventListener("visibilitychange", chkVisibilidadeMudou);

// ============================================================================
// 1) AS SALAS DE HOJE (Meu Painel e aba da liderança)
// ============================================================================
function chkEntradaSala(ctx, servicoId, equipeId) {
  const lista = ctx === "Ges" ? chkSalasGes : chkSalasMeu;
  return lista.find(s => Number(s.servicoId) === Number(servicoId) && Number(s.equipeId) === Number(equipeId)) || null;
}
function chkHtmlJanela(janela) {
  const j = janela && typeof janela === "object" ? janela : null;
  if (!j) return "";
  return j.aberta ? chkSelo(CHK_CLASSE_SELO.ok, "✅ Check-in aberto") : chkSelo(CHK_CLASSE_SELO.atencao, "⛔ Check-in fechado");
}
function chkHtmlCartaoSala(s, ctx) {
  const sid = Number(s.servicoId), eid = Number(s.equipeId);
  const j = s.janela && typeof s.janela === "object" ? s.janela : null;
  return `<div class="cal-cartao chk-sala-cartao" id="chkSalaCartao${ctx}${sid}x${eid}">
    <h5>${escaparHtmlEbd(s.equipeNome)} <span class="psc-legenda">${escaparHtmlEbd(s.congregacaoNome)}</span></h5>
    <p class="chk-selos">${s.faixa ? chkSelo(CHK_CLASSE_SELO.info, `Faixa: ${chkRotuloFaixa(s.faixa)}`) : chkSelo(CHK_CLASSE_SELO.erro, "⚠ Sem faixa etária definida")}
      ${chkSelo(CHK_CLASSE_SELO.neutro, `Serviço às ${chkHoraServico(s.dataHora)}`)} ${chkHtmlJanela(j)}
      ${s.ehMinha ? chkSelo(CHK_CLASSE_SELO.info, "Sou da equipe") : ""} ${s.ehGestao ? chkSelo(CHK_CLASSE_SELO.neutro, "Visão da liderança") : ""}</p>
    ${j && !j.aberta && j.mensagem ? `<p class="psc-legenda">${escaparHtmlEbd(j.mensagem)}</p>` : ""}
    <p class="chk-contagem">👶 ${Number(s.criancasNaSala) || 0} criança(s) na sala · 🧑 ${Number(s.voluntariosNaSala) || 0} voluntário(s) presente(s)</p>
    <div class="psc-acoes"><button type="button" class="btn-confirmar chk-btn" id="chkAbrir${ctx}${sid}x${eid}" data-on-click="chkAbrirSalaAcao" data-args-click="${argsAttr(sid, eid, ctx)}">📂 Abrir a sala</button></div>
  </div>`;
}
const CHK_VAZIO_SALAS = {
  Meu: "Você não está escalado em nenhuma sala com crianças hoje. A sala aparece aqui quando existe um serviço publicado para hoje, a equipe é de “contato com menores” e você está escalado nela (aceito ou confirmado) e habilitado.",
  Ges: "Não há sala com crianças hoje na sua área. A sala aparece aqui quando existe um serviço publicado para hoje com uma equipe de “contato com menores”."
};
function chkAplicarSalas(ctxBruto, resposta) {
  const ctx = chkCtxValido(ctxBruto);
  const lista = chkEl(ctx === "Ges" ? "chkGesSalasLista" : "chkMeuSalasLista");
  if (!lista) return;
  if (resposta.sucesso === false || !Array.isArray(resposta.salas)) {
    if (ctx === "Ges") chkSalasGes = []; else chkSalasMeu = [];
    lista.innerHTML = `<p class="subtitle psc-aviso" role="status">${escaparHtmlEbd(chkMsgErro(resposta))}</p>`;
    return;
  }
  // no Meu Painel só as salas que a pessoa opera; na aba da liderança, as do escopo dela
  const salas = resposta.salas.filter(s => s && typeof s === "object" && chkInteiro(s.servicoId) && chkInteiro(s.equipeId) && (ctx === "Ges" ? s.ehGestao : s.ehMinha));
  if (ctx === "Ges") chkSalasGes = salas; else chkSalasMeu = salas;
  lista.innerHTML = salas.length ? salas.map(s => chkHtmlCartaoSala(s, ctx)).join("") : `<p class="subtitle">${escaparHtmlEbd(CHK_VAZIO_SALAS[ctx])}</p>`;
}

// ---- Meu Painel → Check-in infantil ----
async function chkCarregarMeuPainelAcao() {
  chkVerificarDono();
  if (!chkEl("chkMeuMsg")) return;
  if (!authToken) {
    chkLimparTela();
    chkEscrever("chkMeuMsg", "Entre com a sua matrícula e o seu PIN (ou senha) para ver o check-in infantil.", true);
    return;
  }
  // tocar de novo na aba com a sala aberta NÃO a fecha (e não apaga os códigos que estão na tela): só atualiza a sala
  if (chkSala && chkSala.ctx === "Meu") { chkLerSala(true); return; }
  const geracao = chkGeracao, seq = ++chkSeqMeu;
  chkEscrever("chkMeuMsg", "Carregando…", false);
  const [catalogo, salas, filhos] = await Promise.all([chkGarantirCatalogos(true), chkObter("minhas-salas"), chkObter("meus-filhos")]);
  if (geracao !== chkGeracao || seq !== chkSeqMeu) return;   // resposta velha: a pessoa trocou de login, saiu da aba ou recarregou
  chkEscrever("chkMeuMsg", catalogo ? "" : CHK_MSG_SEM_CATALOGO, !catalogo);
  chkAplicarSalas("Meu", salas);
  chkAplicarFilhos(filhos);
}

// ---- aba da liderança ----
async function chkCarregarOpcoesAcao() {
  chkVerificarDono();
  if (!chkPodeAba()) return;
  if (chkSala && chkSala.ctx === "Ges") { chkLerSala(true); return; }   // tocar de novo na aba com a sala aberta não a fecha
  chkMostrarSecaoAcao(chkSecaoAtual);
}
function chkAplicarSecaoGestao(secao) {
  CHK_SECOES.forEach(nome => {
    const div = chkEl(`chkSecao${capitalize(nome)}`);
    if (div) div.style.display = nome === secao ? "block" : "none";
    const btn = chkEl(`btnChkSecao${capitalize(nome)}`);
    if (btn && btn.classList) btn.classList.toggle("ativo", nome === secao);
    if (btn && btn.setAttribute) btn.setAttribute("aria-pressed", nome === secao ? "true" : "false");
  });
}
function chkMostrarSecaoAcao(secaoBruta, semCarregar) {
  const secao = CHK_SECOES.includes(secaoBruta) ? secaoBruta : "salas";
  const mudou = secao !== chkSecaoAtual;
  chkSecaoAtual = secao;
  if (mudou) {
    if (chkSala && chkSala.ctx === "Ges") chkFecharSalaInterno();   // sair da seção apaga a sala (e o código) da tela
    chkSeqGes++; chkSeqApr++;
    chkSairDasFichas();
    const apr = chkEl("chkAprovacoesLista"); if (apr) apr.innerHTML = "";
    chkAprovacoes = [];
  }
  chkAplicarSecaoGestao(secao);
  if (semCarregar) return;
  if (secao === "salas") chkCarregarSalasGesAcao();
  else if (secao === "aprovacoes") chkCarregarAprovacoesAcao();
  else chkFocarId("chkFiMatricula");
  if (secao !== "aprovacoes") chkPararTimerSeOciosa();
}
async function chkCarregarSalasGesAcao() {
  chkVerificarDono();
  if (!chkPodeAba()) return;
  if (chkSala && chkSala.ctx === "Ges") { chkLerSala(true); return; }
  const geracao = chkGeracao, seq = ++chkSeqGes;
  chkEscrever("chkGesMsg", "Carregando as salas de hoje…", false);
  const [catalogo, salas] = await Promise.all([chkGarantirCatalogos(true), chkObter("minhas-salas")]);
  if (geracao !== chkGeracao || seq !== chkSeqGes) return;
  chkEscrever("chkGesMsg", catalogo ? "" : CHK_MSG_SEM_CATALOGO, !catalogo);
  chkAplicarSalas("Ges", salas);
}

// ============================================================================
// 2) MEUS FILHOS (o responsável consulta o histórico, cuida de quem pode retirar e da saúde; nunca faz o check-in)
// ============================================================================
function chkHtmlFilho(f) {
  const id = Number(f.menorId);
  const botao = (secao, texto) => `<button type="button" class="btn-confirmar btn-secundario chk-btn" id="chkFhBtn${secao}${id}" aria-expanded="false" data-on-click="chkAlternarFilhoAcao" data-args-click="${argsAttr(id, secao.toLowerCase())}">${texto}</button>`;
  return `<div class="cal-cartao chk-filho" id="chkFilho${id}">
    <h5><span class="chk-nome" id="chkFhNome${id}"></span> <span class="psc-legenda">${escaparHtmlEbd(chkAnos(f.idade))}${f.rotuloVinculo ? ` · ${escaparHtmlEbd(f.rotuloVinculo)}` : ""}</span></h5>
    <div class="psc-acoes chk-acoes">${botao("Hist", "📜 Histórico")} ${botao("Aut", "👥 Quem pode retirar")} ${botao("Sau", "⚕️ Saúde")}</div>
    <div id="chkFhHist${id}" class="chk-secao-filho"></div>
    <div id="chkFhAut${id}" class="chk-secao-filho"></div>
    <div id="chkFhSau${id}" class="chk-secao-filho"></div>
  </div>`;
}
function chkAplicarFilhos(resposta) {
  const cx = chkEl("chkFilhosLista");
  if (!cx) return;
  if (resposta.sucesso === false || !Array.isArray(resposta.filhos)) {
    cx.innerHTML = `<p class="subtitle psc-aviso" role="status">${escaparHtmlEbd(chkMsgErro(resposta))}</p>`;
    return;
  }
  const filhos = resposta.filhos.filter(f => f && typeof f === "object" && chkInteiro(f.menorId));
  cx.innerHTML = filhos.length ? filhos.map(chkHtmlFilho).join("")
    : "<p class='subtitle'>Você não é responsável cadastrado de nenhuma criança. Quem cadastra pai, mãe ou tutor é a Secretaria da congregação (com o documento conferido): procure-a se precisar.</p>";
  // o nome da criança entra só por textContent
  filhos.forEach(f => { const n = chkEl(`chkFhNome${Number(f.menorId)}`); if (n) n.textContent = String(f.nome == null ? "" : f.nome); });
}
const CHK_SUFIXO_SECAO = { hist: "Hist", aut: "Aut", sau: "Sau" };
// Em Meus filhos cada seção tem o seu botão (aria-expanded); a ficha da liderança não recolhe: ali a seção está sempre aberta.
function chkSecaoFilhoAberta(pfx, sufixo, id) {
  if (pfx !== "Fh") return true;
  const btn = chkEl(`chkFhBtn${sufixo}${Number(id)}`);
  return !!btn && btn.getAttribute("aria-expanded") === "true";
}
async function chkAlternarFilhoAcao(menorId, secaoBruta) {
  const id = Number(menorId), secao = chkSecaoFilhoValida(secaoBruta);
  if (!chkInteiro(id) || !secao) return;
  const sufixo = CHK_SUFIXO_SECAO[secao];
  const cx = chkEl(`chkFh${sufixo}${id}`), btn = chkEl(`chkFhBtn${sufixo}${id}`);
  if (!cx || !btn) return;
  if (btn.getAttribute("aria-expanded") === "true") {   // fechar: o conteúdo (histórico, nomes, saúde) sai da tela
    cx.innerHTML = "";
    btn.setAttribute("aria-expanded", "false");
    return;
  }
  btn.setAttribute("aria-expanded", "true");
  cx.innerHTML = "<p class='subtitle' role='status'>Carregando…</p>";
  if (secao === "hist") await chkCarregarHistorico(id);
  else if (secao === "aut") await chkCarregarAutorizados("Fh", id);
  else await chkCarregarSaude("Fh", id);
}
const CHK_CLASSE_SITUACAO = { NA_SALA: CHK_CLASSE_SELO.info, RETIRADA_PENDENTE: CHK_CLASSE_SELO.atencao, RETIRADA: CHK_CLASSE_SELO.ok };
function chkHtmlVisita(h) {
  return `<li class="chk-visita">
    <strong>${formatarDataEbd(h.data)}</strong> · ${escaparHtmlEbd(h.sala)}${h.congregacao ? ` (${escaparHtmlEbd(h.congregacao)})` : ""}
    <br />Entrou às ${escaparHtmlEbd(chkHoraInstante(h.entregueEm))}${h.retiradoEm ? ` · saiu às ${escaparHtmlEbd(chkHoraInstante(h.retiradoEm))}` : ""}
    ${chkSelo(CHK_CLASSE_SITUACAO[h.situacao] || CHK_CLASSE_SELO.neutro, h.rotuloSituacao || h.situacao)}
    <br />Quem trouxe: ${escaparHtmlEbd(h.quemTrouxe || "—")}${h.quemRetirou ? ` · quem retirou: ${escaparHtmlEbd(h.quemRetirou)}` : ""}
    ${h.retiradaDivergente ? chkSelo(CHK_CLASSE_SELO.atencao, "Retirada por quem não estava na lista, aprovada pela liderança") : ""}
  </li>`;
}
async function chkCarregarHistorico(menorId) {
  const geracao = chkGeracao;
  const data = await chkObter(`historico?menorId=${Number(menorId)}`);
  const cx = chkEl(`chkFhHist${Number(menorId)}`), btn = chkEl(`chkFhBtnHist${Number(menorId)}`);
  if (geracao !== chkGeracao || !cx || !btn || btn.getAttribute("aria-expanded") !== "true") return;
  if (data.sucesso === false || !Array.isArray(data.historico)) { cx.innerHTML = `<p class="subtitle psc-aviso" role="status">${escaparHtmlEbd(chkMsgErro(data))}</p>`; return; }
  const visitas = data.historico.filter(h => h && typeof h === "object");
  cx.innerHTML = visitas.length
    ? `<p class="psc-legenda">Cada linha é uma visita: quando entrou, quando saiu, quem trouxe e quem retirou. O código de retirada e o nome de quem atendeu a criança não aparecem aqui.</p><ul class="chk-historico">${visitas.map(chkHtmlVisita).join("")}</ul>`
    : "<p class='subtitle'>Nenhuma visita registrada ainda.</p>";
}

// ---- quem pode retirar a criança (o responsável cuida; a liderança registra a ficha assinada) ----
// `pfx`: "Fh" (Meus filhos) ou "Fi" (ficha assinada, aba da liderança). Os ids levam o prefixo e o número da criança.
function chkHtmlAutorizados(pfx, id, data) {
  const lista = (Array.isArray(data.autorizados) ? data.autorizados : []).filter(a => a && typeof a === "object");
  const resp = (Array.isArray(data.responsaveis) ? data.responsaveis : []).filter(r => r && typeof r === "object");
  const limite = Number(Number(data.limite) || (chkCatalogos ? chkCatalogos.maxAutorizados : CHK_MAX_AUTORIZADOS_PADRAO));
  const ficha = pfx === "Fi";
  const itens = lista.map(a => `<li class="chk-autorizado" id="chk${pfx}AutItem${Number(a.autorizadoId)}">
      <strong>${escaparHtmlEbd(a.nome)}</strong> <span class="psc-legenda">${escaparHtmlEbd(a.rotuloParentesco || chkRotuloParentesco(a.parentesco))}${a.validoAte ? ` · vale até ${formatarDataEbd(a.validoAte)}` : " · sem prazo"}${a.forma ? ` · ${escaparHtmlEbd(CHK_FORMA_AUTORIZADO[a.forma] || a.forma)}` : ""}</span>
      <button type="button" class="btn-link btn-link-perigo" id="chk${pfx}AutRev${Number(a.autorizadoId)}" data-on-click="chkRevogarAutorizadoAcao" data-args-click="${argsAttr(Number(a.autorizadoId), pfx, id)}">Revogar</button>
    </li>`).join("");
  const opcoesParentesco = chkOpcoes(chkCatalogos ? chkCatalogos.parentescos : [], x => x.codigo, x => x.rotulo, "— escolha —");
  return `<h6 class="chk-subtitulo" id="chk${pfx}AutTitulo${id}" tabindex="-1">👥 Quem pode retirar</h6>
    <p class="psc-legenda">${resp.length ? `Os responsáveis cadastrados pela Secretaria sempre podem retirar: <strong>${resp.map(r => escaparHtmlEbd(r.nome)).join(", ")}</strong>.` : "Esta criança ainda não tem responsável cadastrado pela Secretaria."} A lista abaixo é de quem o responsável autorizou além deles (no máximo ${limite}).</p>
    ${itens ? `<ul class="chk-lista">${itens}</ul>` : "<p class='subtitle'>Ninguém na lista ainda.</p>"}
    ${lista.length >= limite ? `<p class="psc-aviso" role="status">A lista está cheia (${limite} pessoas). Revogue uma para incluir outra.</p>` : `<div class="cal-form-inline">
      <strong>➕ Autorizar mais uma pessoa</strong>
      <label for="chk${pfx}AutNome${id}">Nome da pessoa</label>
      <input type="text" id="chk${pfx}AutNome${id}" maxlength="150" autocomplete="off" />
      <label for="chk${pfx}AutPar${id}">Quem é para a criança</label>
      <select id="chk${pfx}AutPar${id}">${opcoesParentesco}</select>
      <label for="chk${pfx}AutVal${id}">Vale até (opcional)</label>
      <input type="date" id="chk${pfx}AutVal${id}" />
      <label for="chk${pfx}AutMat${id}">Matrícula, se a pessoa for membro (opcional)</label>
      <input type="number" id="chk${pfx}AutMat${id}" min="1" autocomplete="off" />
      ${ficha ? `<label for="chk${pfx}AutRef${id}">Onde está arquivada a ficha assinada pelo responsável</label>
      <input type="text" id="chk${pfx}AutRef${id}" maxlength="200" autocomplete="off" placeholder="Ex.: Pasta de fichas, folha 12" />` : ""}
      <div class="psc-acoes"><button type="button" class="btn-confirmar chk-btn" id="chk${pfx}AutEnviar${id}" data-on-click="chkAdicionarAutorizadoAcao" data-args-click="${argsAttr(pfx, id, ARG.elemento)}">➕ Autorizar</button></div>
      <p id="chk${pfx}AutMsg${id}" class="subtitle" role="status" aria-live="polite"></p>
    </div>`}`;
}
function chkAplicarAutorizados(pfx, menorId, data) {
  const cx = chkEl(`chk${pfx}Aut${Number(menorId)}`);
  if (!cx) return false;
  if (data.sucesso === false || !Array.isArray(data.autorizados)) { cx.innerHTML = `<p class="subtitle psc-aviso" role="status">${escaparHtmlEbd(chkMsgErro(data))}</p>`; return false; }
  cx.innerHTML = chkHtmlAutorizados(pfx, Number(menorId), data);
  return true;
}
async function chkCarregarAutorizados(pfxBruto, menorId) {
  const pfx = chkPfxValido(pfxBruto), id = Number(menorId), geracao = chkGeracao;
  const data = await chkObter(`autorizados?menorId=${id}`);
  if (geracao !== chkGeracao || !chkSecaoFilhoAberta(pfx, "Aut", id)) return;   // a seção foi recolhida enquanto a resposta vinha: nada entra na tela
  chkAplicarAutorizados(pfx, id, data);
}
async function chkAdicionarAutorizadoAcao(pfxBruto, menorId, botao) {
  const pfx = chkPfxValido(pfxBruto), id = Number(menorId), ficha = pfx === "Fi";
  const campo = (nome) => `chk${pfx}Aut${nome}${id}`;
  const nome = chkEspacos(chkTexto(campo("Nome"))), parentesco = chkTexto(campo("Par")), validoAte = chkTexto(campo("Val"));
  const matTexto = chkTexto(campo("Mat")), referencia = chkEspacos(chkTexto(campo("Ref")));
  const erro = (texto, foco) => { mostrarToast(texto, "erro"); chkEscrever(campo("Msg"), texto, true); chkFocarId(foco); };
  if (nome.length < 2 || nome.length > 150 || chkTemMarca(nome) || (nome.match(/\p{L}/gu) || []).length < 2) { erro("Informe o nome da pessoa (de 2 a 150 caracteres, com letras, sem < ou >).", campo("Nome")); return; }
  if (!parentesco) { erro("Escolha quem é a pessoa para a criança (avó, tio, amigo da família...).", campo("Par")); return; }
  if (validoAte && !/^\d{4}-\d{2}-\d{2}$/.test(validoAte)) { erro("Informe a validade com dia, mês e ano.", campo("Val")); return; }
  if (validoAte && validoAte < calHojeBrasilia()) { erro("A validade não pode ser uma data que já passou.", campo("Val")); return; }
  if (matTexto && !chkInteiro(matTexto)) { erro("A matrícula precisa ser um número.", campo("Mat")); return; }
  if (ficha && (referencia.length < 3 || referencia.length > CHK_MAX_REFERENCIA || chkTemMarca(referencia))) { erro("Diga onde a ficha assinada está arquivada (de 3 a 200 caracteres, sem < ou >).", campo("Ref")); return; }
  const corpo = { menorId: id, nome, parentesco };
  if (matTexto) corpo.membroId = chkInteiro(matTexto);
  if (validoAte) corpo.validoAte = validoAte;
  if (ficha) { corpo.ficha = true; corpo.referencia = referencia; }
  const geracao = chkGeracao;
  await chkProtegerBotao(botao, async () => {
    const data = await chkPostar("autorizado-adicionar", corpo);
    if (geracao !== chkGeracao) return;
    chkMostrarResultado(data, campo("Msg"), false);
    if (data.sucesso === false) return;   // recusa de regra: mensagem do servidor e formulário intacto
    await chkCarregarAutorizados(pfx, id);
    chkEscrever(campo("Msg"), chkMsgErro(data), false);   // o painel foi refeito: a mensagem de sucesso volta para o lugar dela
    chkFocarId(`chk${pfx}AutTitulo${id}`);                // e o botão que a pessoa tocou deixou de existir: o foco vai para o título da lista, que foi refeita
  }, `aut${pfx}${id}`);
}
async function chkRevogarAutorizadoAcao(autorizadoId, pfxBruto, menorId) {
  const pfx = chkPfxValido(pfxBruto), id = Number(menorId);
  if (!chkInteiro(autorizadoId)) return;
  if (!(await chkPerguntar("Revogar esta autorização? A pessoa deixa de poder retirar a criança nas próximas visitas (um check-in que já está aberto continua com a lista de quando foi feito; para esse, peça a segunda via do código).", "Revogar", `chk${pfx}AutRev${Number(autorizadoId)}`))) return;
  const geracao = chkGeracao;
  await chkProtegerBotao(null, async () => {
    const data = await chkPostar("autorizado-revogar", { autorizadoId: Number(autorizadoId) });
    if (geracao !== chkGeracao) return;
    if (!data.jaAvisado) mostrarToast(chkMsgErro(data), data.sucesso === false ? "erro" : "sucesso");
    await chkCarregarAutorizados(pfx, id);
    if (data.sucesso === false) chkEscrever(`chk${pfx}AutMsg${id}`, chkMsgErro(data), true);
    chkFocarId(`chk${pfx}AutTitulo${id}`);   // o botão Revogar saiu da tela com a lista refeita: o foco vai para o título dela
  }, `revogar${autorizadoId}`);
}

// ---- alergia ou condição de saúde (só com a autorização de saúde da v7.7 vigente) ----
function chkHtmlSaude(pfx, id, data) {
  const ficha = pfx === "Fi";
  if (!data.consentimentoVigente) {
    return `<h6 class="chk-subtitulo">⚕️ Alergia ou condição de saúde</h6>
      <p class="psc-aviso" role="status">${ficha
    ? "Ainda não há autorização do responsável para guardar a saúde desta criança. A autorização é registrada primeiro (em Ministério com Menores → ferramentas da Secretaria, ficha de papel) e só depois a informação de saúde."
    : "Para guardar uma alergia ou condição de saúde que aparece na etiqueta, você precisa primeiro <strong>autorizar</strong> em Meu Painel → Ministério com menores (“Alergia ou saúde no crachá”). Sem a autorização a informação não é guardada."}</p>
      ${ficha ? "" : `<div class="psc-acoes"><button type="button" class="btn-confirmar btn-secundario chk-btn" data-on-click="mostrarSubAbaMeupainel" data-args-click='["menores"]'>🧒 Ir para Ministério com menores</button></div>`}`;
  }
  const guardada = data.saude && typeof data.saude === "object" ? data.saude : null;
  return `<h6 class="chk-subtitulo">⚕️ Alergia ou condição de saúde</h6>
    <p class="psc-legenda">Aparece na etiqueta da criança, com um aviso ⚠, para a equipe da sala cuidar dela. Escreva só o que quiser informar (até ${CHK_MAX_SAUDE} caracteres). Você pode apagar quando quiser.${guardada && guardada.atualizadoEm ? ` Guardada em ${escaparHtmlEbd(calDataHora(guardada.atualizadoEm))}.` : ""}</p>
    <div class="cal-form-inline">
      <label for="chk${pfx}SauTexto${id}">Alergia ou condição de saúde</label>
      <textarea id="chk${pfx}SauTexto${id}" rows="3" maxlength="${CHK_MAX_SAUDE}" autocomplete="off" spellcheck="false"></textarea>
      ${ficha ? `<label for="chk${pfx}SauRef${id}">Onde está arquivada a ficha assinada pelo responsável</label>
      <input type="text" id="chk${pfx}SauRef${id}" maxlength="200" autocomplete="off" placeholder="Ex.: Pasta de fichas, folha 12" />` : ""}
      <div class="psc-acoes">
        <button type="button" class="btn-confirmar chk-btn" id="chk${pfx}SauGravar${id}" data-on-click="chkGravarSaudeAcao" data-args-click="${argsAttr(pfx, id, ARG.elemento)}">💾 Guardar</button>
        ${guardada ? `<button type="button" class="btn-confirmar btn-perigo chk-btn" id="chk${pfx}SauApagar${id}" data-on-click="chkApagarSaudeAcao" data-args-click="${argsAttr(pfx, id, ARG.elemento)}">🗑️ Apagar</button>` : ""}
      </div>
      <p id="chk${pfx}SauMsg${id}" class="subtitle" role="status" aria-live="polite"></p>
    </div>`;
}
async function chkCarregarSaude(pfxBruto, menorId) {
  const pfx = chkPfxValido(pfxBruto), id = Number(menorId), geracao = chkGeracao;
  const data = await chkObter(`saude?menorId=${id}`);
  const cx = chkEl(`chk${pfx}Sau${id}`);
  if (geracao !== chkGeracao || !cx || !chkSecaoFilhoAberta(pfx, "Sau", id)) return;   // a seção foi recolhida enquanto a resposta vinha: nada entra na tela
  if (data.sucesso === false) { cx.innerHTML = `<p class="subtitle psc-aviso" role="status">${escaparHtmlEbd(chkMsgErro(data))}</p>`; return; }
  cx.innerHTML = chkHtmlSaude(pfx, id, data);
  // o texto de saúde entra só como valor do campo (nunca como marcação)
  const campo = chkEl(`chk${pfx}SauTexto${id}`);
  if (campo && data.saude && typeof data.saude === "object") campo.value = String(data.saude.texto == null ? "" : data.saude.texto);
}
async function chkGravarSaudeAcao(pfxBruto, menorId, botao) {
  const pfx = chkPfxValido(pfxBruto), id = Number(menorId), ficha = pfx === "Fi";
  const texto = chkEspacos(chkTexto(`chk${pfx}SauTexto${id}`)), referencia = chkEspacos(chkTexto(`chk${pfx}SauRef${id}`));
  const msg = `chk${pfx}SauMsg${id}`;
  const erro = (t, foco) => { mostrarToast(t, "erro"); chkEscrever(msg, t, true); chkFocarId(foco); };
  if (texto.length < 2 || texto.length > CHK_MAX_SAUDE || chkTemMarca(texto)) { erro(`Escreva a alergia ou condição de saúde (de 2 a ${CHK_MAX_SAUDE} caracteres, sem < ou >).`, `chk${pfx}SauTexto${id}`); return; }
  if (ficha && (referencia.length < 3 || referencia.length > CHK_MAX_REFERENCIA || chkTemMarca(referencia))) { erro("Diga onde a ficha assinada está arquivada (de 3 a 200 caracteres, sem < ou >).", `chk${pfx}SauRef${id}`); return; }
  const corpo = { menorId: id, texto };
  if (ficha) { corpo.ficha = true; corpo.referencia = referencia; }
  const geracao = chkGeracao;
  await chkProtegerBotao(botao, async () => {
    const data = await chkPostar("saude-gravar", corpo);
    if (geracao !== chkGeracao) return;
    chkMostrarResultado(data, msg, false);
    if (data.sucesso === false) return;
    await chkCarregarSaude(pfx, id);
    chkEscrever(msg, chkMsgErro(data), false);
    chkFocarId(`chk${pfx}SauTexto${id}`);   // a seção foi refeita e o botão tocado deixou de existir: o foco vai para o campo
  }, `saude${pfx}${id}`);
}
async function chkApagarSaudeAcao(pfxBruto, menorId, botao) {
  const pfx = chkPfxValido(pfxBruto), id = Number(menorId);
  if (!(await chkPerguntar("Apagar a informação de saúde desta criança? Ela deixa de aparecer na etiqueta e não pode ser recuperada.", "Apagar", botao))) return;
  const geracao = chkGeracao;
  await chkProtegerBotao(botao, async () => {
    const data = await chkPostar("saude-apagar", { menorId: id });
    if (geracao !== chkGeracao) return;
    if (!data.jaAvisado) mostrarToast(chkMsgErro(data), data.sucesso === false ? "erro" : "sucesso");
    await chkCarregarSaude(pfx, id);
    chkEscrever(`chk${pfx}SauMsg${id}`, chkMsgErro(data), data.sucesso === false);
    chkFocarId(`chk${pfx}SauTexto${id}`);   // o botão Apagar saiu da tela com a seção refeita: o foco vai para o campo
  }, `apagarsaude${pfx}${id}`);
}

// ---- aba da liderança → Fichas assinadas: a Secretaria registra, a partir do papel, quem pode retirar e a saúde de uma criança ----
async function chkFichaBuscarAcao(botao) {
  chkVerificarDono();
  if (!chkPodeAba()) return;
  const menorId = chkInteiro(chkTexto("chkFiMatricula"));
  if (!menorId) { chkEscrever("chkFichaMsg", "Informe a matrícula da criança (um número).", true); chkFocarId("chkFiMatricula"); return; }
  const geracao = chkGeracao, seq = ++chkSeqFicha;
  await chkProtegerBotao(botao, async () => {
    const cx = chkEl("chkFichaCx");
    if (cx) cx.innerHTML = "";
    chkEscrever("chkFichaMsg", "Procurando a criança…", false);
    const data = await chkObter(`autorizados?menorId=${menorId}`);
    if (geracao !== chkGeracao || seq !== chkSeqFicha) return;
    if (data.sucesso === false || !Array.isArray(data.autorizados)) { chkMostrarResultado(data, "chkFichaMsg", true); return; }
    chkEscrever("chkFichaMsg", "", false);
    const menor = data.menor && typeof data.menor === "object" ? data.menor : {};
    if (cx) cx.innerHTML = `<div class="cal-cartao chk-ficha">
      <h5 id="chkFiTitulo" tabindex="-1"><span class="chk-nome" id="chkFiNome"></span> <span class="psc-legenda">${escaparHtmlEbd(chkAnos(menor.idade))} · matrícula ${menorId}</span></h5>
      <p class="psc-legenda">Registre aqui o que o responsável assinou no papel. A referência diz onde a ficha está arquivada: ela fica junto do registro.</p>
      <div id="chkFiAut${menorId}"></div>
      <div id="chkFiSau${menorId}"></div>
    </div>`;
    const nome = chkEl("chkFiNome"); if (nome) nome.textContent = String(menor.nome == null ? "" : menor.nome);
    chkAplicarAutorizados("Fi", menorId, data);
    await chkCarregarSaude("Fi", menorId);
    if (geracao !== chkGeracao || seq !== chkSeqFicha) return;
    chkFocarId("chkFiTitulo");
  }, "ficha");
}

// ============================================================================
// 3) A TELA DA SALA
// ============================================================================
function chkHtmlEsqueletoSala() {
  return `<div class="chk-sala" id="chkSalaRaiz">
    <div class="psc-acoes chk-barra">
      <button type="button" class="btn-confirmar btn-secundario chk-btn" id="chkVoltarBotao" data-on-click="chkFecharSalaAcao">← Voltar às salas</button>
      <button type="button" class="btn-confirmar btn-secundario chk-btn" id="chkAtualizarBotao" data-on-click="chkAtualizarSalaAcao">🔄 Atualizar agora</button>
    </div>
    <h4 id="chkSalaTitulo" tabindex="-1">Sala</h4>
    <div id="chkSalaCabecalho"></div>
    <p id="chkSalaAtualizado" class="psc-legenda"></p>
    <p id="chkSalaMsg" class="subtitle" role="status" aria-live="polite"></p>
    <div id="chkSalaPendencias"></div>
    <div id="chkSalaLotacao"></div>
    <div id="chkSalaVoluntarios"></div>
    <div id="chkImpressaoCx"></div>
    <div id="chkAcaoCx"></div>
    <h5 class="chk-titulo-lista">👶 Na sala agora</h5>
    <div id="chkNaSalaLista"></div>
    <div id="chkCheckinCx"></div>
    <div id="chkSalaGestaoCx"></div>
  </div>`;
}
function chkHoraComSegundos(valor) {
  const d = new Date(valor);
  if (!valor || Number.isNaN(d.getTime())) return "—";
  return d.toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit", second: "2-digit" });
}
// A sala sai da tela (sem acesso, sala que deixou de existir): a mensagem do servidor fica na lista de salas.
function chkSairDaSala(mensagem, jaAvisado) {
  const ctx = chkSala ? chkSala.ctx : "Meu";
  chkFecharSalaInterno();
  chkEscrever(ctx === "Ges" ? "chkGesMsg" : "chkMeuMsg", mensagem, true);
  if (!jaAvisado) mostrarToast(mensagem, "erro");
}
async function chkAbrirSalaAcao(servicoId, equipeId, ctxBruto) {
  chkVerificarDono();
  const ctx = chkCtxValido(ctxBruto);
  const entrada = chkEntradaSala(ctx, servicoId, equipeId);
  const area = chkEl(`chkSala${ctx}`);
  if (!entrada || !area || !authToken) return;
  chkFecharSalaInterno();   // uma sala de cada vez: a anterior (e qualquer código) sai da tela
  const geracao = chkGeracao, seq = ++chkSeqSala;
  const alvo = { servicoId: Number(servicoId), equipeId: Number(equipeId), ctx, ehMinha: !!entrada.ehMinha, ehGestao: !!entrada.ehGestao, gatilhoId: `chkAbrir${ctx}${Number(servicoId)}x${Number(equipeId)}` };
  chkSala = alvo;
  area.innerHTML = chkHtmlEsqueletoSala();
  chkMostrarListas(ctx, false);
  const titulo = chkEl("chkSalaTitulo");
  if (titulo) titulo.textContent = String(entrada.equipeNome == null ? "Sala" : entrada.equipeNome);
  chkEscrever("chkSalaMsg", "Carregando a sala…", false);
  chkFocarId("chkSalaTitulo");
  chkEmVoo++;
  let catalogo, data;
  try { [catalogo, data] = await Promise.all([chkGarantirCatalogos(), chkObter(`sala?${chkConsultaSala(alvo)}`)]); } finally { if (seq === chkSeqSala && chkEmVoo > 0) chkEmVoo--; }
  if (geracao !== chkGeracao || seq !== chkSeqSala || !chkSala) return;   // a pessoa saiu da sala ou trocou de login enquanto ela vinha
  if (!catalogo) { chkSairDaSala(CHK_MSG_SEM_CATALOGO, false); return; }
  if (data.sucesso === false || !data.sala || typeof data.sala !== "object") { chkSairDaSala(chkMsgErro(data), !!data.jaAvisado); return; }   // sem acesso, sala que não existe, rede ou servidor: a mensagem do servidor (ou a da rede) tal qual
  chkEscrever("chkSalaMsg", "", false);
  if (alvo.ehGestao) chkMontarGestaoDaSala();
  chkAplicarSnapshot(data);
  chkFocarId("chkSalaTitulo");
  chkIniciarTimer();
}
async function chkFecharSalaAcao() {
  if (!chkSala) return;
  // há código na tela que ninguém levou: a saída pergunta antes (o código só aparece uma vez)
  if (chkImpressao && !chkImpressao.impressa && !(await chkPerguntar("Há códigos de retirada na tela que ainda NÃO foram impressos. Eles não aparecem de novo (só a segunda via gera outro). Sair e apagar mesmo assim?", "Sair e apagar", "chkVoltarBotao"))) return;
  if (!chkSala) return;
  const gatilho = chkSala.gatilhoId;
  chkFecharSalaInterno();
  chkFocarId(gatilho);
}
function chkAtualizarSalaAcao() { return chkLerSala(true); }
// A leitura da sala. `forcar`: o ato da pessoa (atualizar agora, depois de um ato): sempre pede, e a resposta mais nova vence. O relógio de 8 s só pede se o pedido anterior já voltou.
async function chkLerSala(forcar) {
  const alvo = chkSala;
  if (!alvo) return;
  if (!forcar && chkEmVoo > 0) return;   // o pedido anterior ainda não voltou: nunca se empilham pedidos
  const geracao = chkGeracao, seq = chkSeqSala, leitura = ++chkSeqLeitura;
  chkEmVoo++;
  let data;
  try { data = await chkObter(`sala?${chkConsultaSala(alvo)}`); } finally { if (seq === chkSeqSala && chkEmVoo > 0) chkEmVoo--; }
  if (geracao !== chkGeracao || seq !== chkSeqSala || leitura !== chkSeqLeitura || !chkSala) return;   // resposta velha: outra mais nova foi pedida, ou a pessoa saiu
  if (data.sucesso === false || !data.sala || typeof data.sala !== "object") {
    // sem acesso (403) ou sala que deixou de existir (404/422): a sala sai da tela. Falha de rede ou do servidor: a tela fica como estava e tenta de novo (até 3 vezes)
    if (data.httpStatus === 403 || data.httpStatus === 404 || data.httpStatus === 422) { chkSairDaSala(chkMsgErro(data), !!data.jaAvisado); return; }
    if (data.sessaoExpirada) return;
    chkFalhas++;
    const parou = chkFalhas >= CHK_MAX_FALHAS;
    chkEscrever("chkSalaMsg", parou ? "Não foi possível atualizar a sala. A atualização automática parou: toque em “Atualizar agora”." : "Não foi possível atualizar agora. A tela tenta de novo em instantes.", true);
    if (parou) chkPararTimer();
    return;
  }
  if (chkFalhas > 0) { chkFalhas = 0; chkEscrever("chkSalaMsg", "", false); chkIniciarTimer(); }
  chkAplicarSnapshot(data);
}

// ---- o que a sala mostra ----
function chkEstouPresente() { return !!chkSnap && (Array.isArray(chkSnap.adultosPresentes) ? chkSnap.adultosPresentes : []).some(v => v && Number(v.membroId) === chkMeuId()); }
function chkPodeOperar() { return !!chkSala && chkSala.ehMinha && chkEstouPresente(); }
function chkJanelaAberta() { return !!(chkSnap && chkSnap.sala && chkSnap.sala.janela && chkSnap.sala.janela.aberta); }
function chkAcharCrianca(registroId) {
  const id = Number(registroId);
  const daSala = chkSnap && Array.isArray(chkSnap.criancas) ? chkSnap.criancas.find(c => c && Number(c.registroId) === id) : null;
  if (daSala) return daSala;
  const apr = chkAprovacoes.find(x => Number(x.crianca.registroId) === id);
  return apr ? apr.crianca : null;
}
function chkAplicarSnapshot(snap) {
  if (!chkSala || !snap || typeof snap !== "object" || !snap.sala) return;
  chkSnap = snap;
  const assinatura = JSON.stringify([snap.sala, snap.adultosPresentes, snap.lotacao, snap.criancas, snap.pendencias, snap.totais]);
  const atualizado = chkEl("chkSalaAtualizado");
  if (atualizado) atualizado.textContent = `Atualizado às ${chkHoraComSegundos(snap.atualizadoEm)}. A tela se atualiza sozinha enquanto estiver aberta.`;
  // a lista só é refeita quando algo mudou: sem piscar e sem tirar o foco de quem está usando
  if (assinatura !== chkAssinatura) {
    chkAssinatura = assinatura;
    chkRenderCabecalho(); chkRenderPendencias(); chkRenderLotacao(); chkRenderVoluntarios(); chkRenderNaSala();
  }
  chkRenderCheckin();
  chkConferirAcaoAberta();
}
function chkRenderCabecalho() {
  const s = chkSnap.sala, j = s.janela && typeof s.janela === "object" ? s.janela : {};
  const titulo = chkEl("chkSalaTitulo");
  if (titulo) titulo.textContent = String(s.equipeNome == null ? "Sala" : s.equipeNome);
  const cx = chkEl("chkSalaCabecalho");
  if (!cx) return;
  cx.innerHTML = `<p class="chk-selos">${chkSelo(CHK_CLASSE_SELO.neutro, s.congregacaoNome)}
      ${s.faixa ? chkSelo(CHK_CLASSE_SELO.info, `Faixa: ${chkRotuloFaixa(s.faixa)}`) : chkSelo(CHK_CLASSE_SELO.erro, "⚠ Sem faixa etária definida")}
      ${chkSelo(CHK_CLASSE_SELO.neutro, `Serviço: ${formatarDataEbd(String(s.dataHora || "").slice(0, 10))} às ${chkHoraServico(s.dataHora)}`)} ${chkHtmlJanela(j)}</p>
    ${s.descricao ? `<p class="psc-legenda">${escaparHtmlEbd(s.descricao)}</p>` : ""}
    ${j.mensagem ? `<p class="${j.aberta ? "psc-legenda" : "psc-aviso"}" role="note">${escaparHtmlEbd(j.mensagem)}</p>` : ""}`;
}
function chkRenderPendencias() {
  const cx = chkEl("chkSalaPendencias");
  if (!cx) return;
  const p = chkSnap.pendencias && typeof chkSnap.pendencias === "object" ? chkSnap.pendencias : {};
  const n = (k) => Number(p[k]) || 0;
  const itens = [
    n("divergencias") ? `🚨 ${n("divergencias")} retirada(s) por quem não está na lista, aguardando a liderança` : "",
    n("travadas") ? `🔒 ${n("travadas")} criança(s) travada(s) por erros do código` : "",
    n("segundasVias") ? `📝 ${n("segundasVias")} segunda(s) via(s) esperando outro adulto confirmar` : ""
  ].filter(Boolean);
  cx.innerHTML = itens.length ? `<div class="cnl-aviso-senha chk-pendencias" role="alert"><strong>Atenção: o que está pendente nesta sala</strong>
    <ul class="chk-lista">${itens.map(t => `<li>${escaparHtmlEbd(t)}</li>`).join("")}</ul></div>` : "";
}
function chkRenderLotacao() {
  const cx = chkEl("chkSalaLotacao");
  if (!cx) return;
  const l = chkSnap.lotacao && typeof chkSnap.lotacao === "object" ? chkSnap.lotacao : {};
  const cap = Number(l.capacidade) || 0, cri = Number(l.criancas) || 0;
  const problemas = (Array.isArray(l.problemas) ? l.problemas : []).filter(x => x && typeof x === "object");
  cx.innerHTML = `<div class="cal-cartao chk-lotacao ${l.ok ? "chk-lotacao-ok" : "chk-lotacao-problema"}">
    <h5>👥 Lotação ${l.ok ? chkSelo(CHK_CLASSE_SELO.ok, "✅ Dentro da regra") : chkSelo(CHK_CLASSE_SELO.erro, "⛔ Fora da regra")}</h5>
    <p class="chk-lotacao-linha">🧑 Adultos aptos presentes: <strong>${Number(l.adultos) || 0}</strong> · 👶 Crianças na sala: <strong>${cri}</strong> · Capacidade: <strong>${cap}</strong>${l.criancasPorAdulto ? ` (${Number(l.criancasPorAdulto)} por adulto)` : ""} · Vagas: <strong>${Number(l.vagas) || 0}</strong></p>
    ${cap > 0 ? `<progress class="chk-progresso" max="${cap}" value="${Math.min(cri, cap)}" aria-label="Crianças na sala em relação à capacidade">${cri} de ${cap}</progress>` : ""}
    ${problemas.length ? `<ul class="chk-problemas">${problemas.map(x => `<li>${escaparHtmlEbd(x.mensagem)}</li>`).join("")}</ul>` : ""}
  </div>`;
}
function chkRenderVoluntarios() {
  const cx = chkEl("chkSalaVoluntarios");
  if (!cx) return;
  const lista = (Array.isArray(chkSnap.adultosPresentes) ? chkSnap.adultosPresentes : []).filter(v => v && typeof v === "object" && chkInteiro(v.membroId));
  const meuId = chkMeuId(), euPresente = chkEstouPresente();
  const itens = lista.map(v => {
    const mid = Number(v.membroId), eu = mid === meuId;
    const selo = v.contaComoAdulto ? chkSelo(CHK_CLASSE_SELO.ok, "conta como adulto")
      : v.apto ? chkSelo(CHK_CLASSE_SELO.neutro, "auxiliar: não conta como adulto") : chkSelo(CHK_CLASSE_SELO.erro, "⚠ não está apto agora: não conta");
    return `<li class="chk-voluntario" id="chkVol${mid}"><strong>${escaparHtmlEbd(v.nome)}</strong>${eu ? " (você)" : ""} <span class="psc-legenda">entrou às ${escaparHtmlEbd(chkHoraInstante(v.entrouEm))}</span> ${selo}
      ${chkSala.ehGestao && !eu ? `<button type="button" class="btn-link btn-link-perigo" id="chkTirar${mid}" data-on-click="chkTirarVoluntarioAcao" data-args-click="${argsAttr(mid, ARG.elemento)}">Tirar da sala</button>` : ""}</li>`;
  }).join("");
  const botao = !chkSala.ehMinha ? ""
    : euPresente ? `<button type="button" class="btn-confirmar btn-secundario chk-btn" id="chkSairBotao" data-on-click="chkSairAcao" data-args-click="${argsAttr(ARG.elemento)}">🚶 Sair da sala</button>`
      : `<button type="button" class="btn-confirmar chk-btn" id="chkEntrarBotao" data-on-click="chkEntrarAcao" data-args-click="${argsAttr(ARG.elemento)}">🙋 Entrar na sala</button>`;
  chkComFoco(() => {
    cx.innerHTML = `<div class="cal-cartao chk-voluntarios">
    <h5>🧑 Quem está na sala (voluntários)</h5>
    ${itens ? `<ul class="chk-lista">${itens}</ul>` : "<p class='subtitle'>Ninguém entrou na sala ainda. O check-in só funciona com pelo menos 2 adultos habilitados presentes.</p>"}
    <div class="psc-acoes">${botao}</div>
  </div>`;
  });
}
// as crianças com pendência vêm primeiro: retirada aguardando a liderança, travada, segunda via; depois, na ordem de chegada
function chkOrdenarCriancas(lista) {
  const peso = (c) => (c.divergencia ? 0 : c.travado ? 1 : c.segundaViaPendente ? 2 : 3);
  return lista.map((c, i) => ({ c, i })).sort((a, b) => peso(a.c) - peso(b.c) || a.i - b.i).map(x => x.c);
}
// refaz um pedaço da tela sem tirar o foco de quem estava num botão dele (a mesma tecla continua no mesmo botão, se ele ainda existir). Se o botão deixou de existir (a criança foi retirada,
// a pessoa entrou ou saiu da sala), o foco NÃO se perde no corpo da página: vai para o título da sala (ou, na fila de aprovações, para o botão da seção).
function chkComFoco(fn) {
  const ativo = document.activeElement;
  const idAtivo = ativo && ativo.id ? ativo.id : "";
  fn();
  if (!idAtivo) return;
  const novo = chkEl(idAtivo);
  if (novo) { if (novo !== ativo) chkFocar(novo); return; }
  chkFocarId(chkSala ? "chkSalaTitulo" : "btnChkSecaoAprovacoes");
}
function chkRenderNaSala() {
  const cx = chkEl("chkNaSalaLista");
  if (!cx) return;
  const criancas = chkOrdenarCriancas((Array.isArray(chkSnap.criancas) ? chkSnap.criancas : []).filter(c => c && typeof c === "object" && chkInteiro(c.registroId)));
  const opc = { operar: chkPodeOperar(), gestao: !!chkSala.ehGestao };
  chkComFoco(() => {
    cx.innerHTML = criancas.length ? criancas.map(c => chkHtmlCrianca(c, opc)).join("") : "<p class='subtitle'>Nenhuma criança na sala agora.</p>";
    chkPreencherNomes(criancas);
  });
}
// o nome da criança e o texto de saúde entram só por textContent
function chkPreencherNomes(criancas) {
  criancas.forEach(c => {
    const id = Number(c.registroId);
    const nome = chkEl(`chkNome${id}`); if (nome) nome.textContent = String(c.nome == null ? "" : c.nome);
    const saude = chkEl(`chkSaude${id}`); if (saude) saude.textContent = `⚠ Saúde: ${c.saude == null ? "" : c.saude}`;
  });
}
function chkHtmlContatosDaGestao(c) {
  const resp = (Array.isArray(c.responsaveisParaContato) ? c.responsaveisParaContato : []).filter(r => r && typeof r === "object");
  return [
    chkCampo("Telefone de quem trouxe", c.telefoneDeQuemTrouxe ? chkHtmlTelefone(c.telefoneDeQuemTrouxe) : ""),
    chkCampo("Responsáveis cadastrados (ligue para confirmar)", resp.length ? `<ul class="chk-lista">${resp.map(r => `<li>${escaparHtmlEbd(r.nome)}: ${chkHtmlTelefone(r.telefone)}</li>`).join("")}</ul>` : "")
  ].join("");
}
// `opc`: { operar: a pessoa é da equipe e está na sala (pode retirar e pedir/confirmar segunda via), gestao: visão da liderança (decide e destrava) }
function chkHtmlCrianca(c, opc) {
  const id = Number(c.registroId), meuId = chkMeuId();
  const div = c.divergencia && typeof c.divergencia === "object" ? c.divergencia : null;
  const via = c.segundaViaPendente && typeof c.segundaViaPendente === "object" ? c.segundaViaPendente : null;
  const travada = !!c.travado;
  const naSala = c.situacao === "NA_SALA";
  const classe = div ? "chk-crianca-divergente" : travada ? "chk-crianca-travada" : via ? "chk-crianca-via" : "";
  const trouxe = c.quemTrouxe && typeof c.quemTrouxe === "object" ? c.quemTrouxe : {};
  const podem = (Array.isArray(c.quemPodeRetirar) ? c.quemPodeRetirar : []).filter(p => p && typeof p === "object");
  const tentativas = Number(c.tentativasRestantes);
  const maxTentativas = chkCatalogos ? chkCatalogos.tentativas : 5;
  const selos = [
    c.tipo === "VISITANTE" ? chkSelo(CHK_CLASSE_SELO.neutro, "Visitante") : chkSelo(CHK_CLASSE_SELO.info, "Membro"),
    c.foraDaFaixa ? chkSelo(CHK_CLASSE_SELO.atencao, "Idade fora da faixa da sala") : "",
    c.saude ? chkSelo(CHK_CLASSE_SELO.erro, "⚠ Saúde") : "",
    travada ? chkSelo(CHK_CLASSE_SELO.erro, "🔒 Travada") : "",
    div ? chkSelo(CHK_CLASSE_SELO.atencao, "⏳ Retirada aguardando a liderança") : "",
    via ? chkSelo(CHK_CLASSE_SELO.info, "📝 Segunda via pedida") : ""
  ].filter(Boolean).join(" ");
  const botao = (acao, args, texto, classeBotao, idBotao) => `<button type="button" class="btn-confirmar chk-btn ${classeBotao}" id="${idBotao}" data-on-click="${acao}" data-args-click="${argsAttr(...args)}">${texto}</button>`;
  const botoes = [
    opc.operar && naSala && !travada ? botao("chkAbrirRetiradaAcao", [id, ARG.elemento], "🚪 Retirar", "", `chkRetirar${id}`) : "",
    opc.operar && naSala && !via ? botao("chkAbrirSegundaViaAcao", [id, ARG.elemento], "📝 Segunda via do código", "btn-secundario", `chkSegVia${id}`) : "",
    opc.operar && via && Number(via.pedidaPorMembroId) !== meuId ? botao("chkConfirmarSegundaViaAcao", [id, ARG.elemento], "✅ Confirmar a segunda via", "", `chkConfSegVia${id}`) : "",
    opc.gestao && div && Number(div.pedidaPorMembroId) !== meuId ? botao("chkDecidirAcao", [id, true, ARG.elemento], "✅ Aprovar a retirada", "", `chkAprovar${id}`) : "",
    opc.gestao && div && Number(div.pedidaPorMembroId) !== meuId ? botao("chkDecidirAcao", [id, false, ARG.elemento], "⛔ Negar a retirada", "btn-perigo", `chkNegar${id}`) : "",
    opc.gestao && travada ? botao("chkDestravarAcao", [id, ARG.elemento], "🔓 Destravar a criança", "btn-secundario", `chkDestravar${id}`) : ""
  ].filter(Boolean).join(" ");
  const avisoDivergencia = div ? (opc.gestao
    ? `<div class="chk-aguardando" role="note"><strong>Quem pediu para retirar não está na lista.</strong>
        <dl class="cal-dl">${chkCampo("Quem pediu", `${escaparHtmlEbd((div.quem && div.quem.nome) || "—")}${div.quem && div.quem.parentesco ? ` (${escaparHtmlEbd(chkRotuloParentesco(div.quem.parentesco))})` : ""}`)}
        ${chkCampo("Documento conferido", div.quem && div.quem.documento ? escaparHtmlEbd(chkRotuloDocumento(div.quem.documento)) : "")}
        ${chkCampo("Pedido às", escaparHtmlEbd(chkHoraInstante(div.pedidaEm)))}${chkHtmlContatosDaGestao(c)}</dl>
        ${Number(div.pedidaPorMembroId) === meuId ? "<p class='psc-legenda'>Foi você quem registrou o pedido: outra pessoa da liderança precisa aprovar ou negar.</p>" : "<p class='psc-legenda'>Ligue para o responsável para confirmar antes de decidir. Aprovar libera a criança a quem pediu.</p>"}</div>`
    : "<div class=\"chk-aguardando\" role=\"note\"><strong>⏳ Aguardando a liderança.</strong> Alguém que não está na lista pediu para retirar esta criança. Ela continua na sala até a liderança decidir.</div>") : "";
  const avisoVia = via ? (Number(via.pedidaPorMembroId) === meuId
    ? "<p class=\"chk-aguardando\" role=\"note\">📝 Você pediu a segunda via: outro adulto da sala precisa conferir o documento e confirmar (em poucos minutos).</p>"
    : `<p class="chk-aguardando" role="note">📝 Segunda via pedida${via.pessoaNome ? ` por ${escaparHtmlEbd(via.pessoaNome)}` : ""}: confira o documento dessa pessoa e confirme.</p>`) : "";
  return `<div class="cal-cartao chk-crianca ${classe}" id="chkCrianca${id}">
    <h5><span class="chk-nome" id="chkNome${id}"></span> <span class="psc-legenda">${escaparHtmlEbd(chkAnos(c.idade))}</span></h5>
    <p class="chk-selos">${selos}</p>
    ${c.saude ? `<p class="chk-alergia" id="chkSaude${id}" role="note"></p>` : ""}
    <dl class="cal-dl">
      ${chkCampo("Entrou às", escaparHtmlEbd(chkHoraInstante(c.entregueEm)))}
      ${chkCampo("Quem trouxe", trouxe.nome ? `${escaparHtmlEbd(trouxe.nome)}${trouxe.parentesco ? ` (${escaparHtmlEbd(chkRotuloParentesco(trouxe.parentesco))})` : ""}` : "")}
      ${chkCampo("Pode retirar", podem.length ? `<ul class="chk-lista">${podem.map(p => `<li>${escaparHtmlEbd(p.nome || p.rotulo)}${p.nome ? ` <span class="psc-legenda">(${escaparHtmlEbd(p.rotulo)})</span>` : ""}</li>`).join("")}</ul>` : "")}
      ${Number.isFinite(tentativas) && tentativas < maxTentativas && naSala ? chkCampo("Tentativas de código que restam", `<strong>${tentativas}</strong>`) : ""}
    </dl>
    ${travada ? `<div class="chk-aguardando" role="note"><strong>🔒 Criança travada.</strong> ${opc.gestao ? "Confirme quem está retirando e destrave, ou emita a segunda via." : "O código foi errado vezes demais. Peça à liderança para destravar ou emita a segunda via do código."}</div>` : ""}
    ${avisoDivergencia}${avisoVia}
    <div class="psc-acoes chk-acoes">${botoes}</div>
  </div>`;
}

// ---- entrar e sair da sala ----
async function chkEntrarAcao(botao) {
  if (!chkSala) return;
  const geracao = chkGeracao, seq = chkSeqSala, sala = chkSala;
  await chkProtegerBotao(botao || chkEl("chkEntrarBotao"), async () => {
    const data = await chkPostar("entrar-na-sala", { servicoId: sala.servicoId, equipeId: sala.equipeId });
    if (geracao !== chkGeracao || seq !== chkSeqSala) return;
    chkMostrarResultado(data, "chkSalaMsg", false);
    await chkLerSala(true);
  }, "entrar");
}
async function chkSairAcao(botao) {
  if (!chkSala) return;
  const geracao = chkGeracao, seq = chkSeqSala, sala = chkSala;
  await chkProtegerBotao(botao || chkEl("chkSairBotao"), async () => {
    const data = await chkPostar("sair-da-sala", { servicoId: sala.servicoId, equipeId: sala.equipeId });
    if (geracao !== chkGeracao || seq !== chkSeqSala) return;
    chkMostrarResultado(data, "chkSalaMsg", false);   // a recusa do servidor (a sala ficaria sem os dois adultos) aparece tal qual
    await chkLerSala(true);
  }, "sair");
}
async function chkTirarVoluntarioAcao(membroId, botao) {
  if (!chkSala || !chkSala.ehGestao || !chkInteiro(membroId)) return;
  const geracao = chkGeracao, seq = chkSeqSala, sala = chkSala;   // a sala de agora: se a pessoa sair dela ou trocar de login com o modal aberto, nada é enviado
  const v = (chkSnap && Array.isArray(chkSnap.adultosPresentes) ? chkSnap.adultosPresentes : []).find(x => x && Number(x.membroId) === Number(membroId));
  if (!(await chkPerguntar(`Tirar ${v ? v.nome : "esta pessoa"} da sala? Use quando alguém esqueceu de sair. A sala precisa continuar com pelo menos 2 adultos se houver crianças.`, "Tirar da sala", botao))) return;
  if (geracao !== chkGeracao || seq !== chkSeqSala || !chkSala) return;
  await chkProtegerBotao(botao, async () => {
    const data = await chkPostar("sair-da-sala", { servicoId: sala.servicoId, equipeId: sala.equipeId, membroId: Number(membroId) });
    if (geracao !== chkGeracao || seq !== chkSeqSala) return;
    chkMostrarResultado(data, "chkSalaMsg", false);
    await chkLerSala(true);
  }, `tirar${membroId}`);
}

// ============================================================================
// 4) O CHECK-IN (criança membro ou visitante; quem trouxe; quem mais pode retirar nesta visita)
// ============================================================================
function chkDataValida(iso) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return false;
  const [a, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, d)).toISOString().slice(0, 10) === iso;
}
function chkIdadeEm(nascimentoIso, hojeIso) {
  const [na, nm, nd] = nascimentoIso.split("-").map(Number), [ha, hm, hd] = hojeIso.split("-").map(Number);
  return ha - na - (hm < nm || (hm === nm && hd < nd) ? 1 : 0);
}
function chkHtmlCheckin() {
  const cat = chkCatalogos;
  const parentescos = chkOpcoes(cat.parentescos, x => x.codigo, x => x.rotulo, "— escolha —");
  const documentos = chkOpcoes(cat.documentos, x => x.codigo, x => x.rotulo, "— escolha —");
  const t = cat.textoSaude;
  const extras = [0, 1, 2].map(i => `<div class="cal-form-grade">
      <div class="input-group"><label for="chkCiExtraNome${i}">Pessoa ${i + 1}: nome</label><input type="text" id="chkCiExtraNome${i}" maxlength="150" autocomplete="off" /></div>
      <div class="input-group"><label for="chkCiExtraPar${i}">Pessoa ${i + 1}: quem é para a criança</label><select id="chkCiExtraPar${i}">${parentescos}</select></div>
    </div>`).join("");
  const termo = t ? `<div id="chkCiVisTermoCx" class="chk-termo" role="group" aria-labelledby="chkCiVisTermoTitulo">
        <h6 id="chkCiVisTermoTitulo" class="chk-subtitulo">${escaparHtmlEbd(t.titulo)}</h6>
        <p class="psc-legenda">O responsável que está aqui precisa ler este texto, em voz alta se preciso, antes de concordar:</p>
        <ul class="chk-termo-itens">${t.itens.map(i => `<li>${escaparHtmlEbd(i)}</li>`).join("")}</ul>
        <label class="opcao-checkbox"><input type="checkbox" id="chkCiVisConcordo" /> ${escaparHtmlEbd(t.aceite)}</label>
      </div>` : "";
  return `<div class="cal-cartao chk-checkin">
    <h5>➕ Receber crianças (check-in)</h5>
    <p id="chkCiAviso" class="psc-aviso" role="status" aria-live="polite"></p>
    <div id="chkCiForm">
      <p class="psc-legenda">Até ${Number(cat.maxCriancas)} crianças da mesma família por vez. No fim saem a <strong>etiqueta</strong> de cada criança e o <strong>recibo</strong> do responsável, com o código de retirada.</p>
      <fieldset class="chk-fieldset">
        <legend>1. Quem vai entrar</legend>
        <div class="input-group">
          <label for="chkCiBusca">Criança membro: digite 3 letras ou mais do nome</label>
          <input type="text" id="chkCiBusca" maxlength="60" autocomplete="off" data-on-input="chkBuscaDigitouAcao" />
        </div>
        <div class="psc-acoes"><button type="button" class="btn-confirmar btn-secundario chk-btn" id="chkCiBuscar" data-on-click="chkBuscarAcao">🔎 Buscar</button></div>
        <p id="chkCiBuscaMsg" class="subtitle" role="status" aria-live="polite"></p>
        <div id="chkCiResultados"></div>
        <details class="chk-visitante" id="chkCiVisDetalhes">
          <summary>Criança visitante (que não é membro)</summary>
          <div class="cal-form-inline">
            <label for="chkCiVisNome">Nome da criança</label>
            <input type="text" id="chkCiVisNome" maxlength="150" autocomplete="off" />
            <label for="chkCiVisNasc">Data de nascimento</label>
            <input type="date" id="chkCiVisNasc" />
            <label for="chkCiVisSaude">Alergia ou condição de saúde (opcional, aparece na etiqueta)</label>
            <textarea id="chkCiVisSaude" rows="2" maxlength="${CHK_MAX_SAUDE}" autocomplete="off" spellcheck="false" data-on-input="chkVisSaudeDigitouAcao"></textarea>
            ${termo}
            <div class="psc-acoes"><button type="button" class="btn-confirmar chk-btn" id="chkCiVisAdicionar" data-on-click="chkAdicionarVisitanteAcao">➕ Adicionar o visitante</button></div>
            <p id="chkCiVisMsg" class="subtitle" role="status" aria-live="polite"></p>
          </div>
        </details>
        <h6 class="chk-subtitulo">Crianças desta entrada</h6>
        <div id="chkCiLista"></div>
      </fieldset>
      <fieldset class="chk-fieldset">
        <legend>2. Quem trouxe a criança</legend>
        <div class="input-group">
          <label for="chkCiTrouxe">Quem trouxe</label>
          <select id="chkCiTrouxe" data-on-change="chkMudouTrouxeAcao"></select>
        </div>
        <div id="chkCiOutraCx" class="cal-form-inline">
          <p class="psc-legenda">Confira o documento de quem trouxe e marque qual foi.</p>
          <label for="chkCiTrouxeNome">Nome de quem trouxe</label>
          <input type="text" id="chkCiTrouxeNome" maxlength="150" autocomplete="off" />
          <label for="chkCiTrouxePar">Quem é para a criança</label>
          <select id="chkCiTrouxePar">${parentescos}</select>
          <label for="chkCiTrouxeDoc">Documento que você conferiu</label>
          <select id="chkCiTrouxeDoc">${documentos}</select>
          <label for="chkCiTrouxeTel" id="chkCiTelRotulo">Telefone com DDD (opcional)</label>
          <input type="text" id="chkCiTrouxeTel" maxlength="20" inputmode="tel" autocomplete="off" />
        </div>
      </fieldset>
      <fieldset class="chk-fieldset">
        <legend>3. Quem mais pode retirar nesta visita (opcional)</legend>
        <details><summary>Indicar até ${CHK_MAX_VISITA} pessoas</summary>${extras}</details>
      </fieldset>
      <div class="psc-acoes"><button type="button" class="btn-confirmar chk-btn chk-btn-principal" id="chkCiEnviar" data-on-click="chkEnviarCheckinAcao" data-args-click="${argsAttr(ARG.elemento)}">✅ Registrar a entrada e gerar as etiquetas</button></div>
      <p id="chkCiMsg" class="subtitle" role="status" aria-live="polite"></p>
    </div>
  </div>`;
}
function chkHaVisitante() { return !!chkCi && chkCi.criancas.some(c => c.tipo === "VISITANTE"); }
// o que dá para mostrar do formulário agora (monta uma vez; depois só ajusta o que depende de "estou na sala" e "a janela está aberta")
function chkRenderCheckin() {
  const cx = chkEl("chkCheckinCx");
  if (!cx || !chkSala || !chkSnap || !chkCatalogos) return;
  if (!chkEl("chkCiForm")) {
    cx.innerHTML = chkHtmlCheckin();
    if (!chkCi) chkCi = { criancas: [], resultados: [], trouxeManual: false };
    chkAtualizarListaCheckin(); chkAtualizarTrouxe(); chkVisSaudeDigitouAcao();
  }
  let aviso = "";
  if (!chkSala.ehMinha) aviso = "Você acompanha esta sala como liderança. Só quem está escalado nela recebe e entrega crianças.";
  else if (!chkEstouPresente()) aviso = "Toque em “Entrar na sala” (acima) para receber e entregar crianças. Só quem está na sala opera o check-in.";
  else if (!chkJanelaAberta()) aviso = (chkSnap.sala.janela && chkSnap.sala.janela.mensagem) || "O check-in desta sala está fechado agora.";
  const form = chkEl("chkCiForm"), avisoEl = chkEl("chkCiAviso");
  if (form) form.style.display = aviso ? "none" : "";
  if (avisoEl) { avisoEl.textContent = aviso; avisoEl.style.display = aviso ? "" : "none"; }
}
// ---- buscar a criança membro ----
function chkBuscaDigitouAcao() {
  chkPararBusca();
  chkSeqBusca++;
  if (chkTexto("chkCiBusca").length < 3) {
    if (chkCi) { chkCi.resultados = []; chkRenderResultados(); }
    chkEscrever("chkCiBuscaMsg", "", false);
    return;
  }
  chkTimerBusca = setTimeout(() => { chkTimerBusca = null; chkBuscarAcao(); }, CHK_MS_BUSCA);
}
async function chkBuscarAcao() {
  if (!chkSala || !chkCi || !chkPodeOperar()) return;
  chkPararBusca();
  const msg = "chkCiBuscaMsg", q = chkEspacos(chkTexto("chkCiBusca"));
  if (q.length < 3) { chkEscrever(msg, "Digite pelo menos 3 letras do nome da criança.", true); chkFocarId("chkCiBusca"); return; }
  if (/[<>%_\[\]]/.test(q)) { chkEscrever(msg, "Use só letras no nome (sem < > % _ [ ]).", true); chkFocarId("chkCiBusca"); return; }
  const geracao = chkGeracao, seq = ++chkSeqBusca, seqSala = chkSeqSala, sala = chkSala;
  chkEscrever(msg, "Buscando…", false);
  const data = await chkObter(`buscar?${chkConsultaSala(sala, `&q=${encodeURIComponent(q)}`)}`);
  if (geracao !== chkGeracao || seq !== chkSeqBusca || seqSala !== chkSeqSala || !chkCi) return;   // resposta velha: outra busca foi pedida, ou a pessoa saiu da sala
  if (data.sucesso === false || !Array.isArray(data.criancas)) { chkCi.resultados = []; chkRenderResultados(); chkMostrarResultado(data, msg, true); return; }
  chkCi.resultados = data.criancas.filter(c => c && typeof c === "object" && chkInteiro(c.menorId));
  chkEscrever(msg, chkCi.resultados.length ? `${chkCi.resultados.length} criança(s) encontrada(s).` : "Nenhuma criança encontrada com esse nome. Se for visitante, use “Criança visitante”.", false);
  chkRenderResultados();
}
function chkRenderResultados() {
  const cx = chkEl("chkCiResultados");
  if (!cx || !chkCi) return;
  const jaNaLista = (id) => chkCi.criancas.some(c => c.tipo === "MEMBRO" && c.menorId === id);
  const lista = chkCi.resultados.filter(r => !jaNaLista(Number(r.menorId)));
  cx.innerHTML = lista.map(r => {
    const id = Number(r.menorId);
    return `<div class="cal-cartao chk-resultado" id="chkRes${id}">
      <strong class="chk-nome" id="chkResNome${id}"></strong> <span class="psc-legenda">${escaparHtmlEbd(chkAnos(r.idade))}</span>
      <p class="chk-selos">${r.temResponsavel ? "" : chkSelo(CHK_CLASSE_SELO.atencao, "Sem responsável cadastrado")} ${r.jaNaSala ? chkSelo(CHK_CLASSE_SELO.erro, "Já está na sala") : ""} ${r.foraDaFaixa ? chkSelo(CHK_CLASSE_SELO.atencao, "Fora da faixa da sala") : ""}</p>
      ${r.temResponsavel ? "" : "<p class='psc-legenda'>Esta criança não tem responsável cadastrado pela Secretaria: quem a trouxe é registrado na hora. Avise a Secretaria para cadastrar o responsável.</p>"}
      <div class="psc-acoes"><button type="button" class="btn-confirmar chk-btn" id="chkAdd${id}" ${r.jaNaSala ? "disabled" : ""} data-on-click="chkAdicionarMembroAcao" data-args-click="${argsAttr(id, ARG.elemento)}">➕ Adicionar</button></div>
    </div>`;
  }).join("");
  lista.forEach(r => { const n = chkEl(`chkResNome${Number(r.menorId)}`); if (n) n.textContent = String(r.nome == null ? "" : r.nome); });
}
async function chkAdicionarMembroAcao(menorId, botao) {
  if (!chkSala || !chkCi || !chkPodeOperar()) return;
  const id = Number(menorId), msg = "chkCiBuscaMsg";
  const r = chkCi.resultados.find(x => Number(x.menorId) === id);
  if (!r) return;
  const limite = chkCatalogos.maxCriancas;
  if (chkCi.criancas.length >= limite) { chkEscrever(msg, `Faça o check-in de até ${limite} crianças por vez.`, true); return; }
  if (chkCi.criancas.some(c => c.tipo === "MEMBRO" && c.menorId === id)) { chkEscrever(msg, "Esta criança já está na lista.", true); return; }
  if (r.jaNaSala) { chkEscrever(msg, "Esta criança já está numa sala e ainda não foi retirada.", true); return; }
  const geracao = chkGeracao, seqSala = chkSeqSala, sala = chkSala;
  await chkProtegerBotao(botao, async () => {
    // os responsáveis cadastrados da criança: é entre eles que se escolhe "quem trouxe"
    const data = await chkObter(`responsaveis?${chkConsultaSala(sala, `&menorId=${id}`)}`);
    if (geracao !== chkGeracao || seqSala !== chkSeqSala || !chkCi) return;
    if (data.sucesso === false || !Array.isArray(data.responsaveis)) { chkMostrarResultado(data, msg, true); return; }
    chkCi.criancas.push({
      tipo: "MEMBRO", menorId: id, nome: String(r.nome == null ? "" : r.nome), idade: Number(r.idade), temResponsavel: !!r.temResponsavel,
      responsaveis: data.responsaveis.filter(x => x && typeof x === "object" && chkInteiro(x.membroId)).map(x => ({ membroId: Number(x.membroId), nome: String(x.nome == null ? "" : x.nome), rotuloVinculo: x.rotuloVinculo ? String(x.rotuloVinculo) : "" }))
    });
    chkEscrever(msg, "", false);
    chkRenderResultados(); chkAtualizarListaCheckin(); chkAtualizarTrouxe();
    chkFocarId("chkCiBusca");
  }, `membro${id}`);
}
// ---- o visitante (a alergia dele só vale com o "concordo" do responsável presente, que lê o texto do catálogo) ----
function chkVisSaudeDigitouAcao() {
  const tem = chkTexto("chkCiVisSaude") !== "";
  const cx = chkEl("chkCiVisTermoCx");
  if (cx) cx.style.display = tem ? "" : "none";
  if (!tem) { const c = chkEl("chkCiVisConcordo"); if (c) c.checked = false; }
}
function chkAdicionarVisitanteAcao() {
  if (!chkSala || !chkCi || !chkPodeOperar()) return;
  const msg = "chkCiVisMsg";
  const erro = (texto, foco) => { mostrarToast(texto, "erro"); chkEscrever(msg, texto, true); chkFocarId(foco); };
  const limite = chkCatalogos.maxCriancas;
  if (chkCi.criancas.length >= limite) { erro(`Faça o check-in de até ${limite} crianças por vez.`, "chkCiVisNome"); return; }
  const nome = chkEspacos(chkTexto("chkCiVisNome")), nascimento = chkTexto("chkCiVisNasc"), saude = chkEspacos(chkTexto("chkCiVisSaude"));
  if (nome.length < 2 || nome.length > 150 || chkTemMarca(nome) || (nome.match(/\p{L}/gu) || []).length < 2) { erro("Informe o nome da criança (de 2 a 150 caracteres, com letras, sem < ou >).", "chkCiVisNome"); return; }
  if (!chkDataValida(nascimento)) { erro("Informe a data de nascimento da criança (dia, mês e ano).", "chkCiVisNasc"); return; }
  const hoje = calHojeBrasilia();
  if (nascimento > hoje) { erro("A data de nascimento não pode ser no futuro.", "chkCiVisNasc"); return; }
  const idade = chkIdadeEm(nascimento, hoje);
  if (idade >= 18) { erro("Só crianças e adolescentes com menos de 18 anos fazem check-in infantil.", "chkCiVisNasc"); return; }
  if (chkCi.criancas.some(c => c.tipo === "VISITANTE" && c.nome.toLowerCase() === nome.toLowerCase() && c.nascimento === nascimento)) { erro("Este visitante já está na lista.", "chkCiVisNome"); return; }
  let dadosSaude = null;
  if (saude) {
    if (saude.length < 2 || saude.length > CHK_MAX_SAUDE || chkTemMarca(saude)) { erro(`A alergia ou condição de saúde aceita de 2 a ${CHK_MAX_SAUDE} caracteres, sem < ou >.`, "chkCiVisSaude"); return; }
    const t = chkCatalogos.textoSaude;
    if (!t || !t.hash) { erro("O texto de autorização da saúde não foi carregado. Toque em “Atualizar agora” e tente de novo.", "chkCiVisSaude"); return; }
    const concordo = chkEl("chkCiVisConcordo");
    if (!concordo || !concordo.checked) { erro("O responsável presente precisa ler o texto e marcar que concorda para a saúde ir na etiqueta.", "chkCiVisConcordo"); return; }
    dadosSaude = { texto: saude, concordo: true, textoHash: t.hash };
  }
  chkCi.criancas.push({ tipo: "VISITANTE", nome, nascimento, idade, saude: dadosSaude });
  ["chkCiVisNome", "chkCiVisNasc", "chkCiVisSaude"].forEach(id => { const el = chkEl(id); if (el) el.value = ""; });
  chkVisSaudeDigitouAcao();
  chkEscrever(msg, "", false);
  chkAtualizarListaCheckin(); chkAtualizarTrouxe();
  chkFocarId("chkCiVisNome");
}
// O texto da autorização de saúde mudou: o "concordo" que o responsável deu foi sobre o texto ANTIGO e não vale mais (o servidor recusaria de novo, a cada tentativa). O visitante que levava alergia
// sai da lista e, se o formulário do visitante está vazio, volta para ele (nome, data e alergia preenchidos, caixa desmarcada): o responsável lê o texto novo, concorda de novo e adiciona outra vez.
function chkReabrirVisitantesComSaude() {
  if (!chkCi) return;
  const comSaude = chkCi.criancas.filter(c => c.tipo === "VISITANTE" && c.saude);
  if (!comSaude.length) return;
  chkCi.criancas = chkCi.criancas.filter(c => !comSaude.includes(c));
  const formVazio = !chkTexto("chkCiVisNome") && !chkTexto("chkCiVisNasc") && !chkTexto("chkCiVisSaude");
  const primeiro = comSaude[0];
  if (formVazio) {
    const preencher = (id, valor) => { const el = chkEl(id); if (el) el.value = valor; };
    preencher("chkCiVisNome", primeiro.nome); preencher("chkCiVisNasc", primeiro.nascimento); preencher("chkCiVisSaude", primeiro.saude.texto);
    const detalhes = chkEl("chkCiVisDetalhes"); if (detalhes) detalhes.open = true;
  }
  const concordo = chkEl("chkCiVisConcordo"); if (concordo) concordo.checked = false;
  chkVisSaudeDigitouAcao(); chkAtualizarListaCheckin(); chkAtualizarTrouxe();
  const nomes = comSaude.map(c => c.nome).join(", ");
  chkEscrever("chkCiVisMsg", `O texto da autorização de saúde mudou: ${nomes} saiu da lista. ${formVazio ? `${primeiro.nome} voltou para o formulário: peça ao responsável para ler o texto novo e marcar que concorda, e adicione de novo.${comSaude.length > 1 ? " Os outros também precisam ser adicionados de novo." : ""}` : "Peça ao responsável para ler o texto novo e marcar que concorda, e adicione de novo."}`, true);
  chkFocarId(formVazio ? "chkCiVisConcordo" : "chkCiVisNome");
}
// ---- a lista de crianças desta entrada ----
function chkRemoverCriancaAcao(indice) {
  if (!chkCi || !Number.isInteger(indice) || indice < 0 || indice >= chkCi.criancas.length) return;
  chkCi.criancas.splice(indice, 1);
  chkAtualizarListaCheckin(); chkAtualizarTrouxe(); chkRenderResultados();
}
function chkAtualizarListaCheckin() {
  const cx = chkEl("chkCiLista");
  if (!cx || !chkCi) return;
  const lista = chkCi.criancas;
  cx.innerHTML = lista.length
    ? `<p class="psc-legenda">${lista.length} de ${Number(chkCatalogos ? chkCatalogos.maxCriancas : CHK_MAX_CRIANCAS_PADRAO)} criança(s) nesta entrada.</p><ul class="chk-lista chk-chips">${lista.map((c, i) => `<li class="chk-chip" id="chkChip${i}">
      <span class="chk-nome" id="chkChipNome${i}"></span> <span class="psc-legenda">${escaparHtmlEbd(chkAnos(c.idade))}</span>
      ${c.tipo === "VISITANTE" ? chkSelo(CHK_CLASSE_SELO.neutro, "Visitante") : chkSelo(CHK_CLASSE_SELO.info, "Membro")}
      ${c.saude ? chkSelo(CHK_CLASSE_SELO.erro, "⚠ Saúde informada") : ""}${c.tipo === "MEMBRO" && !c.temResponsavel ? chkSelo(CHK_CLASSE_SELO.atencao, "Sem responsável cadastrado") : ""}
      <button type="button" class="btn-link btn-link-perigo" data-on-click="chkRemoverCriancaAcao" data-args-click="${argsAttr(i)}">Remover</button></li>`).join("")}</ul>`
    : "<p class='subtitle'>Nenhuma criança adicionada ainda. Busque uma criança membro ou adicione um visitante.</p>";
  lista.forEach((c, i) => { const n = chkEl(`chkChipNome${i}`); if (n) n.textContent = c.nome; });
}
// ---- quem trouxe: um responsável cadastrado de TODAS as crianças membro da lista, ou "outra pessoa" ----
function chkResponsaveisComuns() {
  const membros = chkCi ? chkCi.criancas.filter(c => c.tipo === "MEMBRO") : [];
  if (!membros.length) return [];
  let comuns = membros[0].responsaveis.slice();
  membros.slice(1).forEach(m => { comuns = comuns.filter(r => m.responsaveis.some(x => x.membroId === r.membroId)); });
  return comuns;
}
function chkAtualizarTrouxe() {
  const sel = chkEl("chkCiTrouxe");
  if (!sel || !chkCi) return;
  const atual = sel.value, manual = !!chkCi.trouxeManual;
  const comuns = chkResponsaveisComuns();
  const opcoes = comuns.map(r => ({ valor: String(r.membroId), rotulo: `${r.nome}${r.rotuloVinculo ? ` (${r.rotuloVinculo})` : ""}` }));
  opcoes.push({ valor: CHK_OUTRA, rotulo: "Outra pessoa (preencher abaixo)" });
  sel.innerHTML = chkOpcoes(opcoes, x => x.valor, x => x.rotulo, comuns.length ? "— escolha quem trouxe —" : null);
  // sem responsável cadastrado, "outra pessoa" é a única saída (já escolhida); com responsáveis, quem confere o documento escolhe de propósito (e a escolha dele vale enquanto continuar possível)
  sel.value = manual && atual && Array.from(sel.options).some(o => o.value === atual) ? atual : (comuns.length ? "" : CHK_OUTRA);
  chkAjustarOutraPessoa();
}
function chkMudouTrouxeAcao() {
  if (chkCi) chkCi.trouxeManual = true;
  chkAjustarOutraPessoa();
}
function chkAjustarOutraPessoa() {
  const cx = chkEl("chkCiOutraCx");
  if (cx) cx.style.display = chkTexto("chkCiTrouxe") === CHK_OUTRA ? "" : "none";
  const rot = chkEl("chkCiTelRotulo");
  if (rot) rot.textContent = chkHaVisitante() ? "Telefone com DDD (obrigatório: há criança visitante)" : "Telefone com DDD (opcional)";
}
function chkLimparFormCheckin() {
  if (chkCi) { chkCi.criancas = []; chkCi.resultados = []; chkCi.trouxeManual = false; }
  ["chkCiBusca", "chkCiVisNome", "chkCiVisNasc", "chkCiVisSaude", "chkCiTrouxeNome", "chkCiTrouxePar", "chkCiTrouxeDoc", "chkCiTrouxeTel",
    "chkCiExtraNome0", "chkCiExtraNome1", "chkCiExtraNome2", "chkCiExtraPar0", "chkCiExtraPar1", "chkCiExtraPar2"].forEach(id => { const el = chkEl(id); if (el) el.value = ""; });
  const concordo = chkEl("chkCiVisConcordo"); if (concordo) concordo.checked = false;
  chkRenderResultados(); chkAtualizarListaCheckin(); chkAtualizarTrouxe(); chkVisSaudeDigitouAcao();
  ["chkCiBuscaMsg", "chkCiVisMsg"].forEach(id => chkEscrever(id, "", false));
}
async function chkEnviarCheckinAcao(botao) {
  if (!chkSala || !chkCi || !chkPodeOperar()) return;
  const msg = "chkCiMsg";
  const erro = (texto, foco) => { mostrarToast(texto, "erro"); chkEscrever(msg, texto, true); if (foco) chkFocarId(foco); };
  const lista = chkCi.criancas, limite = chkCatalogos.maxCriancas;
  if (!lista.length) { erro("Adicione pelo menos uma criança: busque um membro ou adicione um visitante.", "chkCiBusca"); return; }
  if (lista.length > limite) { erro(`Faça o check-in de até ${limite} crianças por vez.`, "chkCiBusca"); return; }
  const escolha = chkTexto("chkCiTrouxe");
  let trouxe;
  if (!escolha) { erro("Escolha quem trouxe a criança.", "chkCiTrouxe"); return; }
  if (escolha === CHK_OUTRA) {
    const nome = chkEspacos(chkTexto("chkCiTrouxeNome")), parentesco = chkTexto("chkCiTrouxePar"), documento = chkTexto("chkCiTrouxeDoc");
    const telefone = chkTexto("chkCiTrouxeTel").replace(/\D/g, "");
    if (nome.length < 2 || nome.length > 150 || chkTemMarca(nome) || (nome.match(/\p{L}/gu) || []).length < 2) { erro("Informe o nome de quem trouxe a criança (de 2 a 150 caracteres, com letras, sem < ou >).", "chkCiTrouxeNome"); return; }
    if (!parentesco) { erro("Escolha quem é a pessoa para a criança.", "chkCiTrouxePar"); return; }
    if (!documento) { erro("Escolha o documento que você conferiu de quem trouxe.", "chkCiTrouxeDoc"); return; }
    if (chkHaVisitante() && !telefone) { erro("Informe o telefone de quem trouxe (com DDD): há criança visitante e a liderança precisa falar com o responsável.", "chkCiTrouxeTel"); return; }
    if (telefone && (telefone.length < 10 || telefone.length > 13)) { erro("Informe o telefone com DDD (10 a 13 números).", "chkCiTrouxeTel"); return; }
    trouxe = { nome, parentesco, documento };
    if (telefone) trouxe.contato = telefone;
  } else {
    const rid = chkInteiro(escolha);
    if (!rid || !chkResponsaveisComuns().some(r => r.membroId === rid)) { erro("Escolha quem trouxe entre os responsáveis cadastrados, ou “outra pessoa”.", "chkCiTrouxe"); return; }
    trouxe = { responsavelId: rid };
  }
  const extras = [];
  for (let i = 0; i < CHK_MAX_VISITA; i++) {
    const nome = chkEspacos(chkTexto(`chkCiExtraNome${i}`)), parentesco = chkTexto(`chkCiExtraPar${i}`);
    if (!nome && !parentesco) continue;
    if (nome.length < 2 || nome.length > 150 || chkTemMarca(nome) || (nome.match(/\p{L}/gu) || []).length < 2) { erro(`Pessoa ${i + 1}: informe o nome (de 2 a 150 caracteres, com letras, sem < ou >).`, `chkCiExtraNome${i}`); return; }
    if (!parentesco) { erro(`Pessoa ${i + 1}: escolha quem ela é para a criança.`, `chkCiExtraPar${i}`); return; }
    extras.push({ nome, parentesco });
  }
  const corpo = {
    servicoId: chkSala.servicoId, equipeId: chkSala.equipeId, trouxe,
    criancas: lista.map(c => (c.tipo === "MEMBRO" ? { menorId: c.menorId } : { visitante: Object.assign({ nome: c.nome, nascimento: c.nascimento }, c.saude ? { saude: { texto: c.saude.texto, concordo: true, textoHash: c.saude.textoHash } } : {}) }))
  };
  if (extras.length) corpo.autorizadosVisita = extras;
  const geracao = chkGeracao, seqSala = chkSeqSala;
  await chkProtegerBotao(botao || chkEl("chkCiEnviar"), async () => {
    const data = await chkPostar("checkin", corpo);
    if (geracao !== chkGeracao || seqSala !== chkSeqSala || !chkSala) return;
    if (data.sucesso !== true || !Array.isArray(data.etiquetas) || !data.etiquetas.length) {
      // recusa de regra (janela, lotação, criança já na sala...): a mensagem do servidor tal qual e o formulário intacto
      chkMostrarResultado(data, msg, true);
      if (data.termoMudou) {   // o texto da autorização de saúde mudou: a tela pega o novo e o responsável lê de novo
        chkGarantirCatalogos(true).then(() => { if (geracao !== chkGeracao || seqSala !== chkSeqSala) return; const c = chkEl("chkCiVisConcordo"); if (c) c.checked = false; chkReabrirVisitantesComSaude(); });
      }
      if (data.httpStatus === 409) chkLerSala(true);
      return;
    }
    chkMostrarResultado(data, msg, false);
    chkLimparFormCheckin();
    chkMostrarImpressao("CHECKIN", data.etiquetas, data.recibo);
    await chkLerSala(true);
  }, "checkin");
}

// ============================================================================
// 5) A ETIQUETA E O RECIBO (o código só existe aqui, em memória, e só nesta caixa; sai ao fechar, ao sair da sala, ao trocar de tela e ao trocar de login)
// ============================================================================
function chkReciboDaEtiqueta(et) {
  return { sala: et.sala, congregacao: et.congregacao, instante: et.instante, trouxe: null, criancas: [{ nome: et.nome, codigo: et.codigo }], orientacao: et.orientacao || "Apresente o código na hora de retirar. Sem o código a criança não é entregue, mesmo a quem a equipe conhece." };
}
// tudo o que é do código entra por createElement + textContent (nunca por texto de HTML)
function chkNoEtiqueta(item, l, e) {
  const et = item.etiqueta;
  const raiz = chkNo("div", "chk-etiqueta"); raiz.id = `chkEtq${l}x${e}`;
  raiz.appendChild(chkNo("div", "chk-etq-nome", `${et.nome == null ? "" : et.nome}${et.idade != null ? ` · ${chkAnos(et.idade)}` : ""}`));
  raiz.appendChild(chkNo("div", "chk-etq-sala", [et.sala, et.congregacao].filter(Boolean).join(" · ")));
  const cod = chkNo("div", "chk-codigo", et.codigo == null ? "" : et.codigo); cod.id = `chkCodigo${l}x${e}`;
  raiz.appendChild(cod);
  if (et.saude) { const s = chkNo("div", "chk-alergia", `⚠ SAÚDE: ${et.saude}`); s.id = `chkEtqSaude${l}x${e}`; raiz.appendChild(s); }
  raiz.appendChild(chkNo("div", "chk-etq-hora", `Entrada às ${chkHoraInstante(et.instante)}`));
  if (item.foraDaFaixa) raiz.appendChild(chkNo("div", "chk-so-tela chk-aviso-faixa", "⚠ A idade está fora da faixa desta sala (o check-in foi feito mesmo assim)."));
  return raiz;
}
function chkNoRecibo(recibo, l) {
  const r = recibo;
  const raiz = chkNo("div", "chk-recibo"); raiz.id = `chkRecibo${l}`;
  raiz.appendChild(chkNo("h6", "chk-recibo-titulo", "Recibo do responsável"));
  raiz.appendChild(chkNo("p", "chk-recibo-linha", [r.sala, r.congregacao].filter(Boolean).join(" · ")));
  raiz.appendChild(chkNo("p", "chk-recibo-linha", `Entrada às ${chkHoraInstante(r.instante)}${r.trouxe ? ` · quem trouxe: ${r.trouxe}` : ""}`));
  (Array.isArray(r.criancas) ? r.criancas : []).forEach((c, k) => {
    const cod = chkNo("span", "chk-codigo chk-codigo-recibo", c && c.codigo != null ? c.codigo : ""); cod.id = `chkReciboCodigo${l}x${k}`;
    raiz.appendChild(chkNo("p", "chk-recibo-crianca", null, [chkNo("span", "chk-recibo-nome", c && c.nome != null ? c.nome : ""), document.createTextNode(" "), cod]));
  });
  if (r.orientacao) raiz.appendChild(chkNo("p", "chk-recibo-orientacao", r.orientacao));
  return raiz;
}
function chkRenderImpressao(comFoco) {
  const cx = chkEl("chkImpressaoCx");
  if (!cx) return;
  if (!chkImpressao || !chkImpressao.lotes.length) { cx.innerHTML = ""; return; }
  cx.innerHTML = `<div class="cal-cartao chk-impressao">
    <h5 id="chkImpressaoTitulo" tabindex="-1">🏷️ Etiquetas e recibo para imprimir</h5>
    <p class="cnl-aviso-senha" role="note"><strong>Os códigos aparecem só agora.</strong> Imprima, cole a etiqueta na criança e entregue o recibo ao responsável. Sem o código ninguém retira a criança, nem quem a equipe conhece. Se o código se perder, é a segunda via (conferida por dois adultos da sala).</p>
    <div class="psc-acoes chk-barra">
      <button type="button" class="btn-confirmar chk-btn" id="chkImprimirBotao" data-on-click="chkImprimirAcao">🖨️ Imprimir etiquetas e recibo</button>
      <button type="button" class="btn-confirmar btn-secundario chk-btn" id="chkFecharImpressaoBotao" data-on-click="chkFecharImpressaoAcao">✖ Fechar e apagar os códigos da tela</button>
    </div>
    <div id="chkImprimivel" class="chk-imprimivel"></div>
  </div>`;
  const alvo = chkEl("chkImprimivel");
  chkImpressao.lotes.forEach((lote, l) => {
    const raiz = chkNo("section", "chk-lote"); raiz.id = `chkLote${l}`;
    const etiquetas = chkNo("div", "chk-etiquetas");
    lote.etiquetas.forEach((it, e) => etiquetas.appendChild(chkNoEtiqueta(it, l, e)));
    raiz.appendChild(etiquetas);
    raiz.appendChild(chkNoRecibo(lote.recibo, l));
    alvo.appendChild(raiz);
  });
  if (comFoco) { chkRolarPara("chkImpressaoCx"); chkFocarId("chkImpressaoTitulo"); }
}
function chkMostrarImpressao(tipo, etiquetas, recibo) {
  if (!chkSala) return;
  const itens = (Array.isArray(etiquetas) ? etiquetas : []).filter(x => x && typeof x === "object" && x.etiqueta && typeof x.etiqueta === "object");
  if (!itens.length) return;
  if (!chkImpressao) chkImpressao = { lotes: [], impressa: false };
  chkImpressao.lotes.push({ tipo, etiquetas: itens, recibo: recibo && typeof recibo === "object" ? recibo : chkReciboDaEtiqueta(itens[0].etiqueta) });
  chkImpressao.impressa = false;
  chkRenderImpressao(true);
}
// Imprime só as etiquetas e o recibo: a classe que esconde o resto da página existe apenas durante a impressão (CSS @media print, app/style.css)
function chkImprimirAcao() {
  if (!chkImpressao) return;
  const classes = document.body && document.body.classList;
  if (classes) classes.add("chk-imprimindo", "chk-imp-etiquetas");
  try { window.print(); } finally { if (classes) classes.remove("chk-imprimindo", "chk-imp-etiquetas"); }
  chkImpressao.impressa = true;
}
async function chkFecharImpressaoAcao() {
  if (!chkImpressao) return;
  if (!chkImpressao.impressa && !(await chkPerguntar("Os códigos de retirada ainda NÃO foram impressos e não aparecem de novo (só a segunda via gera outro). Fechar e apagar mesmo assim?", "Fechar e apagar", "chkFecharImpressaoBotao"))) return;
  chkImpressao = null;
  chkRenderImpressao(false);
  chkLimparImpressaoDaPagina();
  chkFocarId("chkSalaTitulo");
}

// ============================================================================
// 6) RETIRADA E SEGUNDA VIA (o código digitado nunca fica no campo; quem não está na lista só sai com a liderança)
// ============================================================================
function chkFecharPainelAcao(semFoco) {
  const area = chkEl("chkAcaoCx");
  if (area) area.innerHTML = "";
  const gatilho = chkGatilhoForm;
  chkAcao = null; chkGatilhoForm = null;
  if (!semFoco && gatilho) chkVoltarFoco(gatilho);
}
function chkFecharAcaoAcao() { chkFecharPainelAcao(false); }
// Depois de cada leitura: se a criança do painel aberto já saiu ou mudou de estado (outra pessoa agiu), o painel fecha e diz por quê.
function chkConferirAcaoAberta() {
  const a = chkAcao;
  if (!a) return;
  // a pessoa deixou de estar na sala (a liderança a tirou, ou ela saiu em outro aparelho): o servidor recusaria cada envio, então o painel não fica aberto à toa
  if (!chkPodeOperar()) {
    chkFecharPainelAcao(true);
    chkEscrever("chkSalaMsg", "Você não está mais na sala (a liderança pode ter tirado você, ou você saiu em outro aparelho): toque em “Entrar na sala” para voltar a receber e entregar crianças.", true);
    return;
  }
  const c = chkAcharCrianca(a.registroId);
  const ok = c && c.situacao === "NA_SALA" && (a.tipo === "retirada" ? !c.travado && !c.divergencia : !c.segundaViaPendente);
  if (ok) return;
  chkFecharPainelAcao(true);
  chkEscrever("chkSalaMsg", c ? "O estado desta criança mudou enquanto você agia (outra pessoa atuou). Confira antes de continuar." : "Esta criança já saiu da sala.", true);
}
function chkOpcoesPessoas(c, comOutra) {
  const podem = (Array.isArray(c.quemPodeRetirar) ? c.quemPodeRetirar : []).filter(p => p && typeof p === "object" && typeof p.ref === "string");
  const lista = podem.map(p => ({ valor: p.ref, rotulo: `${p.nome || p.rotulo}${p.nome ? ` (${p.rotulo})` : ""}` }));
  if (comOutra) lista.push({ valor: CHK_OUTRA, rotulo: "Outra pessoa (não está na lista)" });
  return chkOpcoes(lista, x => x.valor, x => x.rotulo, "— escolha —");
}
function chkFormRetirada(c) {
  const parentescos = chkOpcoes(chkCatalogos.parentescos, x => x.codigo, x => x.rotulo, "— escolha —");
  const documentos = chkOpcoes(chkCatalogos.documentos, x => x.codigo, x => x.rotulo, "— escolha —");
  return `<div class="cal-form-inline chk-painel-acao" id="chkRtPainel">
    <strong>🚪 Retirar <span class="chk-nome" id="chkAcaoNome"></span></strong>
    <p class="psc-legenda">Quem retira precisa do <strong>código</strong> da etiqueta (ou do recibo). Sem o código ninguém retira, nem quem a equipe conhece.</p>
    <form id="chkRtForm" data-on-submit="chkEnviarRetiradaAcao" data-prevent="submit">
      <label for="chkRtQuem">Quem está retirando a criança?</label>
      <select id="chkRtQuem" data-on-change="chkMudouRetiranteAcao">${chkOpcoesPessoas(c, true)}</select>
      <div id="chkRtOutraCx">
        <p class="psc-aviso" role="note">Quem não está na lista só leva a criança se a <strong>liderança aprovar</strong>. Confira o documento e marque qual foi.</p>
        <label for="chkRtNome">Nome de quem está retirando</label>
        <input type="text" id="chkRtNome" maxlength="150" autocomplete="off" />
        <label for="chkRtPar">Quem é para a criança</label>
        <select id="chkRtPar">${parentescos}</select>
        <label for="chkRtDoc">Documento que você conferiu</label>
        <select id="chkRtDoc">${documentos}</select>
      </div>
      <label for="chkRtCodigo">Código da etiqueta (6 letras e números)</label>
      <input type="text" id="chkRtCodigo" class="chk-campo-codigo" maxlength="12" autocomplete="off" autocapitalize="characters" spellcheck="false" />
      <div class="psc-acoes">
        <button type="submit" class="btn-confirmar chk-btn" id="chkRtEnviar">✅ Entregar a criança</button>
        <button type="button" class="btn-link" data-on-click="chkFecharAcaoAcao">cancelar</button>
      </div>
    </form>
    <p id="chkRtMsg" class="subtitle" role="status" aria-live="polite"></p>
  </div>`;
}
function chkAbrirRetiradaAcao(registroId, gatilho) {
  const c = chkAcharCrianca(registroId), area = chkEl("chkAcaoCx");
  if (!c || !area || !chkSala || !chkPodeOperar() || !chkCatalogos) return;
  chkAcao = { tipo: "retirada", registroId: Number(registroId) };
  chkGatilhoForm = gatilho && typeof gatilho === "object" && gatilho.id ? gatilho.id : null;   // o id, não o elemento: a lista é refeita a cada leitura da sala
  area.innerHTML = chkFormRetirada(c);
  const nome = chkEl("chkAcaoNome"); if (nome) nome.textContent = String(c.nome == null ? "" : c.nome);
  chkMudouRetiranteAcao();
  chkRolarPara("chkAcaoCx");
  chkFocarId("chkRtQuem");   // o foco vai para o primeiro campo do painel que acabou de abrir
}
function chkMudouRetiranteAcao() {
  const cx = chkEl("chkRtOutraCx");
  if (cx) cx.style.display = chkTexto("chkRtQuem") === CHK_OUTRA ? "" : "none";
}
async function chkEnviarRetiradaAcao() {
  const a = chkAcao;
  if (!a || a.tipo !== "retirada" || !chkSala || !chkPodeOperar()) return;
  const botao = chkEl("chkRtEnviar"), msg = "chkRtMsg";
  const erro = (texto, foco) => { chkEscrever(msg, texto, true); if (foco) chkFocarId(foco); };
  const quem = chkTexto("chkRtQuem"), digitado = chkTexto("chkRtCodigo");
  if (!quem) { erro("Escolha quem está retirando a criança.", "chkRtQuem"); return; }
  let retirante;
  if (quem === CHK_OUTRA) {
    const nome = chkEspacos(chkTexto("chkRtNome")), parentesco = chkTexto("chkRtPar"), documento = chkTexto("chkRtDoc");
    if (nome.length < 2 || nome.length > 150 || chkTemMarca(nome) || (nome.match(/\p{L}/gu) || []).length < 2) { erro("Informe o nome de quem está retirando (de 2 a 150 caracteres, com letras, sem < ou >).", "chkRtNome"); return; }
    if (!parentesco) { erro("Escolha quem é a pessoa para a criança.", "chkRtPar"); return; }
    if (!documento) { erro("Escolha o documento que você conferiu.", "chkRtDoc"); return; }
    retirante = { outro: { nome, parentesco, documento } };
  } else retirante = { ref: quem };
  if (!digitado) { erro("Digite o código da etiqueta.", "chkRtCodigo"); return; }
  const codigo = digitado.replace(/[\s-]/g, "").toUpperCase();
  if (!/^[A-HJKMNP-Z2-9]{6}$/.test(codigo)) { erro("O código tem 6 letras e números, como está na etiqueta (não usa 0, 1, O, I nem L). Confira e digite de novo.", "chkRtCodigo"); return; }
  const geracao = chkGeracao, seqSala = chkSeqSala, registroId = a.registroId;
  await chkProtegerBotao(botao, async () => {
    const data = await chkPostar("retirar", { registroId, codigo, retirante });
    const campo = chkEl("chkRtCodigo"); if (campo) campo.value = "";   // o código digitado nunca fica no campo, qualquer que seja a resposta
    if (geracao !== chkGeracao || seqSala !== chkSeqSala || !chkSala) return;
    if (data.sucesso === true) {
      chkFecharPainelAcao(false);
      chkMostrarResultado(data, "chkSalaMsg", false);   // retirada feita, ou pedido enviado à liderança (divergente): a mensagem do servidor diz qual
      await chkLerSala(true);
      return;
    }
    if (data.codigoErrado === true && data.travada !== true) {   // código errado: o painel fica aberto, com o campo limpo para digitar de novo
      chkMostrarResultado(data, msg, true);
      chkFocarId("chkRtCodigo");
      chkLerSala(true);
      return;
    }
    if (data.travada === true || data.httpStatus === 409) {   // travada pelos erros, ou o registro mudou: o painel fecha e a sala é refeita
      chkFecharPainelAcao(true);
      chkMostrarResultado(data, "chkSalaMsg", true);
      await chkLerSala(true);
      return;
    }
    chkMostrarResultado(data, msg, true);   // outra recusa (escolha, lista, formato): a mensagem do servidor tal qual, e o formulário intacto
    if (data.httpStatus === 403) chkLerSala(true);   // se o acesso à sala acabou, a leitura tira a pessoa da tela
  }, `retirar${registroId}`);
}
// ---- segunda via do código: quem confere o documento pede; OUTRO adulto da sala confirma (dois olhares) ----
function chkFormSegundaVia(c) {
  const documentos = chkOpcoes(chkCatalogos.documentos, x => x.codigo, x => x.rotulo, "— escolha —");
  return `<div class="cal-form-inline chk-painel-acao" id="chkSvPainel">
    <strong>📝 Segunda via do código de <span class="chk-nome" id="chkAcaoNome"></span></strong>
    <p class="psc-legenda">Para quem perdeu a etiqueta e o recibo. Confira o <strong>documento</strong> de quem pede (precisa estar na lista de quem pode retirar). Depois <strong>outro adulto da sala</strong> confirma em até ${Number(chkCatalogos.segundaViaMinutos)} minutos: o código antigo deixa de valer.</p>
    <form id="chkSvForm" data-on-submit="chkEnviarSegundaViaAcao" data-prevent="submit">
      <label for="chkSvQuem">Quem está pedindo</label>
      <select id="chkSvQuem">${chkOpcoesPessoas(c, false)}</select>
      <label for="chkSvDoc">Documento que você conferiu</label>
      <select id="chkSvDoc">${documentos}</select>
      <div class="psc-acoes">
        <button type="submit" class="btn-confirmar chk-btn" id="chkSvEnviar">📝 Pedir a segunda via</button>
        <button type="button" class="btn-link" data-on-click="chkFecharAcaoAcao">cancelar</button>
      </div>
    </form>
    <p id="chkSvMsg" class="subtitle" role="status" aria-live="polite"></p>
  </div>`;
}
function chkAbrirSegundaViaAcao(registroId, gatilho) {
  const c = chkAcharCrianca(registroId), area = chkEl("chkAcaoCx");
  if (!c || !area || !chkSala || !chkPodeOperar() || !chkCatalogos) return;
  chkAcao = { tipo: "segundavia", registroId: Number(registroId) };
  chkGatilhoForm = gatilho && typeof gatilho === "object" && gatilho.id ? gatilho.id : null;   // o id, não o elemento: a lista é refeita a cada leitura da sala
  area.innerHTML = chkFormSegundaVia(c);
  const nome = chkEl("chkAcaoNome"); if (nome) nome.textContent = String(c.nome == null ? "" : c.nome);
  chkRolarPara("chkAcaoCx");
  chkFocarId("chkSvQuem");
}
async function chkEnviarSegundaViaAcao() {
  const a = chkAcao;
  if (!a || a.tipo !== "segundavia" || !chkSala || !chkPodeOperar()) return;
  const botao = chkEl("chkSvEnviar"), msg = "chkSvMsg";
  const erro = (texto, foco) => { chkEscrever(msg, texto, true); if (foco) chkFocarId(foco); };
  const quem = chkTexto("chkSvQuem"), documento = chkTexto("chkSvDoc");
  if (!quem) { erro("Escolha quem está pedindo a segunda via, entre os que podem retirar a criança.", "chkSvQuem"); return; }
  if (!documento) { erro("Escolha o documento que você conferiu.", "chkSvDoc"); return; }
  const geracao = chkGeracao, seqSala = chkSeqSala, registroId = a.registroId;
  await chkProtegerBotao(botao, async () => {
    const data = await chkPostar("segunda-via-pedir", { registroId, pessoa: { ref: quem }, documento });
    if (geracao !== chkGeracao || seqSala !== chkSeqSala || !chkSala) return;
    if (data.sucesso === false) {
      chkMostrarResultado(data, msg, true);
      if (data.httpStatus === 409 || data.httpStatus === 403) chkLerSala(true);
      return;
    }
    chkFecharPainelAcao(false);
    chkMostrarResultado(data, "chkSalaMsg", false);
    await chkLerSala(true);
  }, `segundavia${registroId}`);
}
async function chkConfirmarSegundaViaAcao(registroId, botao) {
  const c = chkAcharCrianca(registroId);
  if (!chkSala || !chkPodeOperar()) return;
  const via = c && c.segundaViaPendente;
  if (!c || !via) { chkLerSala(true); return; }
  const geracao = chkGeracao, seqSala = chkSeqSala, id = Number(registroId);
  if (!(await chkPerguntar(`Você conferiu o documento de ${via.pessoaNome || "quem pediu"} e confirma a segunda via do código de ${c.nome}? O código antigo deixa de valer agora e a etiqueta nova sai na tela.`, "Confirmar a segunda via", botao))) return;
  if (geracao !== chkGeracao || seqSala !== chkSeqSala || !chkSala) return;
  await chkProtegerBotao(botao, async () => {
    const data = await chkPostar("segunda-via-confirmar", { registroId: id });
    if (geracao !== chkGeracao || seqSala !== chkSeqSala || !chkSala) return;
    if (data.sucesso !== true || !data.etiqueta || typeof data.etiqueta !== "object") {
      chkMostrarResultado(data, "chkSalaMsg", true);
      await chkLerSala(true);
      return;
    }
    chkMostrarResultado(data, "chkSalaMsg", false);
    chkMostrarImpressao("SEGUNDA_VIA", [{ registroId: id, etiqueta: data.etiqueta }], null);   // a etiqueta nova sai do mesmo jeito: o código novo só aparece aqui
    await chkLerSala(true);
  }, `confsegundavia${id}`);
}

// ============================================================================
// 7) A LIDERANÇA: decidir retirada divergente, destravar criança e o relatório do dia
// ============================================================================
function chkIdMensagemAtual() { return chkSala ? "chkSalaMsg" : "chkAprMsg"; }
function chkAtualizarDepoisDoAto() { return chkSala ? chkLerSala(true) : chkCarregarAprovacoes(false); }
async function chkDecidirAcao(registroId, aprovar, botao) {
  const c = chkAcharCrianca(registroId);
  if (!c || !c.divergencia || typeof aprovar !== "boolean") { chkAtualizarDepoisDoAto(); return; }
  const quem = c.divergencia.quem && typeof c.divergencia.quem === "object" ? c.divergencia.quem : {};
  const pergunta = aprovar
    ? `Aprovar a retirada de ${c.nome} por ${quem.nome || "quem pediu"}? Antes, confirme com o responsável pelo telefone cadastrado. Aprovando, a criança é liberada a essa pessoa e o ato fica registrado com o seu nome.`
    : `Negar a retirada de ${c.nome} por ${quem.nome || "quem pediu"}? A criança continua na sala e só sai com quem está na lista ou com outra aprovação.`;
  const geracao = chkGeracao, seqSala = chkSeqSala, id = Number(registroId);   // a tela de agora: se a pessoa sair ou trocar de login com um modal aberto, nada é enviado depois
  if (!(await chkPerguntar(pergunta, aprovar ? "Aprovar a retirada" : "Negar a retirada", botao))) return;
  // o motivo fica registrado: de 8 a 300 caracteres, sem < ou >; texto curto demais volta a ser pedido, com o que já foi escrito
  let motivo = "";
  for (;;) {
    const digitado = await pedirTexto(`Motivo da decisão (de ${CHK_MIN_MOTIVO} a ${CHK_MAX_MOTIVO} caracteres)`, "Ex.: liguei para a mãe, que confirmou que a tia busca.", motivo);
    if (digitado == null) { chkVoltarFoco(botao); return; }
    motivo = chkEspacos(digitado);
    if (motivo.length >= CHK_MIN_MOTIVO && motivo.length <= CHK_MAX_MOTIVO && !chkTemMarca(motivo)) break;
    mostrarToast(`Escreva o motivo com ${CHK_MIN_MOTIVO} a ${CHK_MAX_MOTIVO} caracteres, sem < ou >.`, "erro");
  }
  chkVoltarFoco(botao);
  if (geracao !== chkGeracao || seqSala !== chkSeqSala) return;
  await chkProtegerBotao(botao, async () => {
    const data = await chkPostar("decidir-divergencia", { registroId: id, aprovar, motivo });   // 428: o fetchProtegido confirma a identidade e repete a chamada uma vez
    if (geracao !== chkGeracao || seqSala !== chkSeqSala) return;
    chkMostrarResultado(data, chkIdMensagemAtual(), data.sucesso === false);
    await chkAtualizarDepoisDoAto();
  }, `decidir${id}`);
}
async function chkDestravarAcao(registroId, botao) {
  const c = chkAcharCrianca(registroId);
  if (!c) { chkAtualizarDepoisDoAto(); return; }
  const geracao = chkGeracao, seqSala = chkSeqSala, id = Number(registroId);
  if (!(await chkPerguntar(`Destravar ${c.nome}? Faça isso só depois de confirmar quem está retirando a criança. O código continua o mesmo: quem o perdeu pede a segunda via.`, "Destravar", botao))) return;
  if (geracao !== chkGeracao || seqSala !== chkSeqSala) return;
  await chkProtegerBotao(botao, async () => {
    const data = await chkPostar("destravar", { registroId: id });
    if (geracao !== chkGeracao || seqSala !== chkSeqSala) return;
    chkMostrarResultado(data, chkIdMensagemAtual(), data.sucesso === false);
    await chkAtualizarDepoisDoAto();
  }, `destravar${id}`);
}
function chkMontarGestaoDaSala() {
  const cx = chkEl("chkSalaGestaoCx");
  if (!cx) return;
  cx.innerHTML = `<div class="cal-cartao chk-gestao">
    <h5>📄 Relatório do dia (liderança)</h5>
    <p class="psc-legenda">Todas as crianças desta sala hoje, com os horários e cada ato registrado (entrada, código errado, retirada, aprovação, segunda via).</p>
    <div class="psc-acoes"><button type="button" class="btn-confirmar btn-secundario chk-btn" id="chkRelatorioBotao" data-on-click="chkAbrirRelatorioAcao" data-args-click="${argsAttr(ARG.elemento)}">📄 Abrir o relatório do dia</button></div>
    <p id="chkRelMsg" class="subtitle" role="status" aria-live="polite"></p>
    <div id="chkRelatorioCx"></div>
  </div>`;
}
function chkTabela(titulos, linhas) {
  const rolagem = chkNo("div", "chk-rolagem");
  const tabela = chkNo("table", "tabela-frequencia chk-tabela");
  const cab = chkNo("tr");
  titulos.forEach(t => { const th = chkNo("th", "", t); th.setAttribute("scope", "col"); cab.appendChild(th); });
  tabela.appendChild(chkNo("thead", "", null, [cab]));
  const corpo = chkNo("tbody");
  linhas.forEach(l => corpo.appendChild(chkNo("tr", "", null, l.map(v => chkNo("td", "", v == null ? "" : v)))));
  tabela.appendChild(corpo);
  rolagem.appendChild(tabela);
  return rolagem;
}
const CHK_ROTULO_SITUACAO = { NA_SALA: "Na sala", RETIRADA_PENDENTE: "Aguardando a liderança", RETIRADA: "Retirada" };
function chkRenderRelatorio(data) {
  const cx = chkEl("chkRelatorioCx");
  if (!cx) return;
  cx.innerHTML = `<div class="psc-acoes chk-barra">
      <button type="button" class="btn-confirmar chk-btn" id="chkRelImprimirBotao" data-on-click="chkImprimirRelatorioAcao">🖨️ Imprimir o relatório</button>
      <button type="button" class="btn-confirmar btn-secundario chk-btn" id="chkRelFecharBotao" data-on-click="chkFecharRelatorioAcao">✖ Fechar o relatório</button>
    </div>
    <div id="chkRelImprimivel" class="chk-rel-imprimivel"></div>`;
  const alvo = chkEl("chkRelImprimivel");
  const s = data.sala && typeof data.sala === "object" ? data.sala : {};
  const hora = chkHoraInstante;
  alvo.appendChild(chkNo("h5", "", `Relatório do dia: ${s.equipeNome == null ? "" : s.equipeNome} · ${s.congregacaoNome == null ? "" : s.congregacaoNome}`));
  alvo.appendChild(chkNo("p", "psc-legenda", `Serviço de ${String(s.dataHora || "").slice(0, 10).split("-").reverse().join("/")} às ${chkHoraServico(s.dataHora)}. Horário de Brasília.`));
  alvo.appendChild(chkNo("h6", "chk-subtitulo", "Voluntários"));
  alvo.appendChild(chkTabela(["Voluntário", "Entrou", "Saiu"], (Array.isArray(data.voluntarios) ? data.voluntarios : []).map(v => [v.nome, hora(v.entrouEm), v.saiuEm ? hora(v.saiuEm) : "ainda na sala"])));
  alvo.appendChild(chkNo("h6", "chk-subtitulo", "Crianças"));
  alvo.appendChild(chkTabela(["Criança", "Tipo", "Idade", "Entrada", "Quem trouxe", "Situação", "Saída", "Quem retirou", "Retirada divergente"],
    (Array.isArray(data.criancas) ? data.criancas : []).map(c => [c.nome, c.tipo === "VISITANTE" ? "Visitante" : "Membro", chkAnos(c.idade), hora(c.entregueEm), c.quemTrouxe || "—", CHK_ROTULO_SITUACAO[c.situacao] || c.situacao,
      c.retiradoEm ? hora(c.retiradoEm) : "—", c.quemRetirou ? `${c.quemRetirou}${CHK_ROTULO_TIPO_RETIRANTE[c.tipoRetirante] ? ` (${CHK_ROTULO_TIPO_RETIRANTE[c.tipoRetirante]})` : ""}` : "—", c.retiradaDivergente ? "Sim" : "Não"])));
  alvo.appendChild(chkNo("h6", "chk-subtitulo", "Tudo o que foi registrado"));
  alvo.appendChild(chkTabela(["Hora", "O que aconteceu", "Quem", "Detalhe"], (Array.isArray(data.eventos) ? data.eventos : []).map(e => [hora(e.em), e.rotulo || e.tipo, e.ator, e.detalhe || ""])));
}
async function chkAbrirRelatorioAcao(botao) {
  if (!chkSala || !chkSala.ehGestao) return;
  const geracao = chkGeracao, seqSala = chkSeqSala, seq = ++chkSeqRel, sala = chkSala;
  await chkProtegerBotao(botao, async () => {
    chkEscrever("chkRelMsg", "Carregando o relatório…", false);
    const data = await chkObter(`relatorio?${chkConsultaSala(sala)}`);
    if (geracao !== chkGeracao || seqSala !== chkSeqSala || seq !== chkSeqRel || !chkSala) return;
    if (data.sucesso === false || !Array.isArray(data.criancas)) { chkMostrarResultado(data, "chkRelMsg", true); return; }
    chkEscrever("chkRelMsg", "", false);
    chkRenderRelatorio(data);
    chkRolarPara("chkRelatorioCx");
  }, "relatorio");
}
function chkFecharRelatorioAcao() {
  chkSeqRel++;
  const cx = chkEl("chkRelatorioCx"); if (cx) cx.innerHTML = "";
  chkLimparImpressaoDaPagina();
  chkFocarId("chkRelatorioBotao");
}
function chkImprimirRelatorioAcao() {
  const classes = document.body && document.body.classList;
  if (classes) classes.add("chk-imprimindo", "chk-imp-relatorio");
  try { window.print(); } finally { if (classes) classes.remove("chk-imprimindo", "chk-imp-relatorio"); }
}

// ---- aba da liderança → Aprovações: o que espera a liderança em TODAS as salas de hoje do escopo ----
function chkRenderAprovacoes() {
  const cx = chkEl("chkAprovacoesLista");
  if (!cx) return;
  chkComFoco(() => {
    cx.innerHTML = chkAprovacoes.length
      ? chkAprovacoes.map(x => `<div class="chk-apr-grupo"><p class="chk-apr-sala"><strong>${escaparHtmlEbd(x.sala.equipeNome)}</strong> · ${escaparHtmlEbd(x.sala.congregacaoNome)}</p>${chkHtmlCrianca(x.crianca, { operar: false, gestao: true })}</div>`).join("")
      : "<p class='subtitle'>Nada espera a liderança agora: nenhuma retirada por quem não está na lista e nenhuma criança travada.</p>";
    chkPreencherNomes(chkAprovacoes.map(x => x.crianca));
  });
}
function chkCarregarAprovacoesAcao() { return chkCarregarAprovacoes(false); }
async function chkCarregarAprovacoes(silencioso) {
  chkVerificarDono();
  if (!chkPodeAba() || chkSala) return;
  const geracao = chkGeracao, seq = ++chkSeqApr;
  if (!silencioso) chkEscrever("chkAprMsg", "Procurando o que espera a liderança…", false);
  const [catalogo, minhas] = await Promise.all([chkGarantirCatalogos(), chkObter("minhas-salas")]);
  if (geracao !== chkGeracao || seq !== chkSeqApr || chkSala) return;
  if (!catalogo || minhas.sucesso === false || !Array.isArray(minhas.salas)) { chkFalhaDasAprovacoes(minhas, catalogo, silencioso); return; }
  const salas = minhas.salas.filter(s => s && typeof s === "object" && s.ehGestao && chkInteiro(s.servicoId) && chkInteiro(s.equipeId) && Number(s.criancasNaSala) > 0).slice(0, 15);
  const leituras = await Promise.all(salas.map(s => chkObter(`sala?${chkConsultaSala(s)}`)));
  if (geracao !== chkGeracao || seq !== chkSeqApr || chkSala) return;
  const itens = [];
  let falhou = null;
  salas.forEach((s, i) => {
    const d = leituras[i];
    if (d.sucesso === false || !Array.isArray(d.criancas)) { falhou = falhou || d; return; }
    chkOrdenarCriancas(d.criancas.filter(c => c && typeof c === "object" && chkInteiro(c.registroId) && (c.divergencia || c.travado)))
      .forEach(c => itens.push({ sala: d.sala && typeof d.sala === "object" ? d.sala : s, crianca: c }));
  });
  if (falhou && !itens.length) { chkFalhaDasAprovacoes(falhou, true, silencioso); return; }
  if (chkFalhas > 0) chkFalhas = 0;
  chkAprovacoes = itens;
  chkEscrever("chkAprMsg", itens.length ? `${itens.length} item(ns) esperando a liderança.` : "", false);
  chkRenderAprovacoes();
  chkIniciarTimer();
}
function chkFalhaDasAprovacoes(resposta, catalogo, silencioso) {
  if (resposta && resposta.sessaoExpirada) return;
  chkFalhas++;
  const parou = chkFalhas >= CHK_MAX_FALHAS;
  chkEscrever("chkAprMsg", !catalogo ? CHK_MSG_SEM_CATALOGO : (parou && silencioso ? "A atualização automática parou: toque em “Atualizar”." : chkMsgErro(resposta)), true);
  if (parou) chkPararTimer();
}

registrarAcoes({
  chkAbrirRelatorioAcao, chkAbrirRetiradaAcao, chkAbrirSalaAcao, chkAbrirSegundaViaAcao, chkAdicionarAutorizadoAcao, chkAdicionarMembroAcao, chkAdicionarVisitanteAcao, chkAlternarFilhoAcao,
  chkApagarSaudeAcao, chkAtualizarSalaAcao, chkBuscaDigitouAcao, chkBuscarAcao, chkCarregarAprovacoesAcao, chkCarregarMeuPainelAcao, chkCarregarSalasGesAcao, chkConfirmarSegundaViaAcao,
  chkDecidirAcao, chkDestravarAcao, chkEntrarAcao, chkEnviarCheckinAcao, chkEnviarRetiradaAcao, chkEnviarSegundaViaAcao, chkFecharAcaoAcao, chkFecharImpressaoAcao, chkFecharRelatorioAcao,
  chkFecharSalaAcao, chkFichaBuscarAcao, chkGravarSaudeAcao, chkImprimirAcao, chkImprimirRelatorioAcao, chkMostrarSecaoAcao, chkMudouRetiranteAcao, chkMudouTrouxeAcao,
  chkRemoverCriancaAcao, chkRevogarAutorizadoAcao, chkSairAcao, chkTirarVoluntarioAcao, chkVisSaudeDigitouAcao
});
