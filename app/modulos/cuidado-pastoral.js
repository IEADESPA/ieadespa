// app/modulos/cuidado-pastoral.js — v7.11: Cuidado pastoral — filas com responsável, prazo e sigilo (Regimento Art. 128 §5º, II, b; Art. 85 §3º, I; Art. 132; LGPD arts. 7º, 11 e 18).
// Script clássico, carregado pelo index.html DEPOIS do script.js e do eventos.js: compartilha o escopo global com eles. As ações que o HTML pede deste módulo são
// registradas aqui mesmo, no fim do arquivo (registrarAcoes mescla). Todos os nomes de nível superior começam com "cpa"/"CPA_" (scripts clássicos dividem um só escopo).
//
// Duas telas sobre uma rota do servidor (GestaoCuidadoPastoral: /api/cuidado-pastoral/*), prefixo "cpa":
//   1) aba "Cuidado pastoral" (permissão cuidado_pastoral, sessão de liderança): a FILA (quem precisa de alguém, com responsável, prazo e a escada do prazo vencido), o detalhe do
//      acompanhamento (contato, troca de responsável, adiar, concluir, cancelar e as NOTAS PASTORAIS), os PEDIDOS DE ORAÇÃO (moderação e sinal de risco), o BOLETIM de oração
//      (sem nome, para imprimir) e o PAINEL por congregação;
//   2) Meu Painel → Cuidado (qualquer login, inclusive PIN): "Meus acompanhamentos" (só aparece para quem foi nomeado responsável), "Pedir oração", "Pedir visita", "Meus pedidos" e o
//      boletim de oração da própria congregação. Os telefones de ajuda (188, 190, 180, 100) ficam SEMPRE à vista embaixo do pedido de oração.
// Toda regra (quem vê o quê, prazos, escada, níveis de nota, sinal de risco, linha do boletim) mora no servidor (shared/cuidadoPastoral.js e shared/cuidadoPastoralDb.js): aqui só se
// monta o que ele devolve e se manda o que a pessoa fez. Recusa de regra vem como 422 { mensagem } e é mostrada tal qual, sem limpar o formulário; 404 é a MESMA resposta para "não
// existe" e "não é seu" (a tela só diz que não foi possível abrir); 409 = "mudou enquanto isso": o acompanhamento é relido; 428 = confirmação reforçada da vD.4 (chave de acesso ou
// código por e-mail): a tela chama o MESMO confirmarFatorAgora do fetchProtegido e repete a chamada uma vez (cada tentativa com o seu prazo de 20 s).
// PRIVACIDADE: o texto de uma nota pastoral só sai do servidor ao "Abrir" (cada abertura fica registrada), entra na tela só por textContent e sai do DOM ao fechar, ao trocar de
// acompanhamento, ao sair da aba e ao trocar de login. Nome, nota e pedido de oração nunca vão para endereço (a busca de pessoas é por POST), localStorage, sessionStorage nem console.
// Tudo o que vem do servidor e entra em innerHTML passa por escaparHtmlEbd; as ações do HTML recebem só id numérico ou constante nossa (data-args por argsAttr).
const CPA_ROTA = "cuidado-pastoral";
const CPA_SECOES = ["fila", "pedidos", "boletim", "painel"];
const CPA_SITUACOES_FILA = ["ABERTOS", "VENCIDOS", "SEM_RESPONSAVEL", "URGENTES", "ENCERRADOS"];
const CPA_SITUACOES_PEDIDOS = ["AGUARDANDO", "RISCO", "APROVADOS", "TODOS"];
const CPA_TEMPO_LIMITE_MS = 20000;              // cada chamada desiste depois de 20 s (rede ruim, celular que dormiu): a pessoa vê que não deu e tenta de novo
const CPA_MSG_FATOR = "Este ato precisa de uma confirmação recente de quem você é (chave de acesso ou código por e-mail). Tente de novo e confirme quando a tela pedir.";
const CPA_MSG_TEMPO = "O servidor demorou mais de 20 segundos para responder. Verifique a internet e tente de novo. Se você estava gravando alguma coisa, confira na lista antes de repetir.";
const CPA_MSG_REDE = "Não foi possível falar com o servidor agora. Verifique a internet e tente de novo.";
const CPA_MSG_NAO_ABRIU = "Não foi possível abrir este acompanhamento. Ele pode não existir, ter mudado de responsável ou estar fora do seu alcance.";
const CPA_MSG_SEM_CATALOGO = "Não foi possível carregar as opções do cuidado pastoral agora. Verifique a internet e toque em Atualizar.";
const CPA_MSG_PEDIDO_NAO_FOI = "O seu pedido NÃO foi enviado. Tente de novo daqui a pouco. Se é urgente, procure o Dirigente ou o pastor pessoalmente.";
// os mesmos telefones do servidor (api/shared/cuidadoPastoral.js → CONTATOS_DE_AJUDA): só valem se o catálogo do servidor não chegou (rede caída)
const CPA_CONTATOS_PADRAO = [
  { nome: "CVV — Centro de Valorização da Vida", numero: "188", descricao: "De graça, 24 horas, todos os dias. Para quem está sofrendo ou pensando em tirar a própria vida." },
  { nome: "Polícia", numero: "190", descricao: "Se existe perigo agora." },
  { nome: "Central de Atendimento à Mulher", numero: "180", descricao: "De graça, 24 horas. Para a mulher que sofre violência." },
  { nome: "Disque 100", numero: "100", descricao: "De graça, 24 horas. Violência contra criança, adolescente, idoso ou pessoa com deficiência." }
];
// os limites do servidor (o catálogo traz os valores; estes só valem se ele não trouxer)
const CPA_LIMITES_PADRAO = { motivo: 300, observacao: 300, nota: 2000, pedido: 1000, boletim: 200, nome: 150, contato: 150, adiarDias: 30, contatoRetroativoDias: 7 };
// o prazo: cor, ícone e classe por faixa (o ícone e o texto dizem o mesmo que a cor: ninguém depende só da cor)
const CPA_CLASSE_FAIXA = { NORMAL: "cal-st-homologado", ATENCAO: "cal-st-proposto", VENCIDO: "cal-st-indeferido cpa-vencido" };
const CPA_ICONE_FAIXA = { NORMAL: "⏳", ATENCAO: "⚠️", VENCIDO: "⛔" };
const CPA_DEGRAU_CURTO = { AREA: "a Área", REGIAO: "a Região", GERAL: "o nível geral" };
const CPA_ROTULO_STATUS = { ABERTO: "Aberto", CONCLUIDO: "Concluído", CANCELADO: "Cancelado" };
const CPA_ROTULO_EVENTO = {
  CRIADO: "Acompanhamento aberto", ATRIBUIDO: "Responsável nomeado", CONTATO: "Contato registrado", PRAZO_ADIADO: "Prazo adiado", CONCLUIDO: "Concluído",
  CANCELADO: "Cancelado", URGENTE: "Ficou urgente (sinal de risco)", ESCALONADO: "Prazo vencido: subiu de degrau", LEMBRETE_GERAL: "Prazo vencido de novo: lembrete ao nível geral"
};
const CPA_ROTULO_MODERACAO = { AGUARDANDO: "Esperando moderação", APROVADO: "No boletim de oração", NAO_PUBLICAR: "Lido: fica só com a liderança" };
const CPA_ROTULO_SECAO = { fila: "Fila", pedidos: "Pedidos de oração", boletim: "Boletim de oração", painel: "Painel" };
const CPA_FORMS = ["contato", "concluir", "responsavel", "adiar", "cancelar", "nota"];
// o primeiro campo de cada formulário do acompanhamento: para lá vai o foco quando o formulário abre (teclado e leitor de tela)
const CPA_PRIMEIRO_CAMPO = { contato: "cpaFcForma", concluir: "cpaFkDesfecho", responsavel: "cpaFrBusca", adiar: "cpaFaData", cancelar: "cpaFxDesfecho", nota: "cpaFnNivel" };
// as buscas de pessoa (POST buscar-pessoas: o nome digitado não vai no endereço). soMaior: o responsável é sempre maior de idade (o servidor confere de novo)
const CPA_BUSCAS = {
  novoPessoa: { campo: "cpaNovoBusca", res: "cpaNovoBuscaRes", escolhido: "cpaNovoEscolhido", cong: "cpaNovoCong", soMaior: false },
  novoResp: { campo: "cpaNovoRespBusca", res: "cpaNovoRespRes", escolhido: "cpaNovoRespEscolhido", cong: "cpaNovoCong", soMaior: true },
  troca: { campo: "cpaFrBusca", res: "cpaFrRes", escolhido: "", cong: "", soMaior: true },
  regMembro: { campo: "cpaRpBusca", res: "cpaRpBuscaRes", escolhido: "cpaRpEscolhido", cong: "cpaRpCong", soMaior: false }
};

let cpaDono = null;                 // matrícula + tipo de sessão de quem a tela foi montada (não vaza dado ao trocar de login)
let cpaCatalogos = null;            // GET catalogos (tipos, formas, desfechos, níveis de nota, categorias, contatos de ajuda, limites, papéis da sessão)
let cpaCongregacoes = [];           // GET congregacoes (as do território da liderança)
let cpaGeracao = 0;                 // sobe a cada limpeza da tela: um pedido de outra "geração" não mexe na tela de agora
let cpaSecaoAtual = "fila";
let cpaSituacaoPedidos = "AGUARDANDO";
let cpaFila = [];                   // GET fila (na ordem do servidor)
let cpaMeus = [];                   // GET meus (os acompanhamentos de que a pessoa é responsável)
let cpaPedidos = [];                // GET pedidos
let cpaDet = null;                  // o acompanhamento aberto: { ctx: "Ges"|"Meu", itemId, dados (GET item) }
let cpaNotas = [];                  // as notas que a pessoa pode ler sobre o acompanhamento aberto (só o cabeçalho: o texto sai ao abrir)
let cpaBuscaRes = {};               // alvo da busca -> [{ membroId, nome, lideranca, maior }]
let cpaEscolhas = {};               // alvo da busca -> { membroId, nome } (a pessoa escolhida no formulário)
let cpaPedFormAberto = 0;           // o pedido de oração com o formulário (publicar/desmarcar) aberto
let cpaGatilhoForm = null;          // o botão que abriu o formulário: o foco volta para ele quando o formulário fecha
let cpaGatilhoDetalhe = null;       // o botão que abriu o acompanhamento: o foco volta para ele ao voltar à lista
let cpaDetCarregando = "";          // o contexto ("Ges"/"Meu") de um acompanhamento que ainda está a caminho (fechar antes de ele chegar também o descarta)
let cpaSeqMeusLista = 0, cpaSeqFila = 0, cpaSeqDet = 0, cpaSeqNotas = 0, cpaSeqNota = 0, cpaSeqLeit = 0, cpaSeqPed = 0, cpaSeqBol = 0, cpaSeqPainel = 0, cpaSeqMeu = 0, cpaSeqMeusPed = 0, cpaSeqBolMeu = 0, cpaSeqBusca = 0;
const cpaEmCurso = new Set();       // trava duplo clique nas ações que gravam

// A aba abre para quem tem a permissão; o que cada um vê dentro dela o SERVIDOR decide (o catálogo traz os papéis da sessão).
function cpaPodeAba() { return authPermissoes.includes("cuidado_pastoral"); }
function cpaEhGestao() { return !!(cpaCatalogos && cpaCatalogos.papeis.gestao); }
function cpaEhGeral() { return !!(cpaCatalogos && cpaCatalogos.papeis.geral); }

// ---- utilidades ----
function cpaEl(id) { return document.getElementById(id); }
function cpaTexto(id) { const c = cpaEl(id); return c ? String(c.value == null ? "" : c.value).trim() : ""; }
function cpaInteiro(v) { const n = Number(v); return Number.isInteger(n) && n >= 1 ? n : 0; }
function cpaMsgErro(data) { return (data && data.mensagem) || "Não foi possível concluir a operação agora."; }
function cpaTemMarca(texto) { return /[<>]/.test(texto); }
function cpaTem(mapa, chave) { return !!mapa && Object.prototype.hasOwnProperty.call(mapa, chave); }
function cpaCtx(bruto) { return bruto === "Meu" ? "Meu" : "Ges"; }   // só as duas constantes nossas entram em id e argumento
function cpaLimite(nome) { const l = cpaCatalogos && cpaCatalogos.limites; const n = l ? Number(l[nome]) : NaN; return Number(Number.isInteger(n) && n > 0 ? n : CPA_LIMITES_PADRAO[nome]); }
function cpaSelo(classe, rotulo) { return `<span class="cal-selo cpa-selo ${classe}">${escaparHtmlEbd(rotulo)}</span>`; }
function cpaCampo(rotulo, html) { return html ? `<div><dt>${rotulo}</dt><dd>${html}</dd></div>` : ""; }
function cpaData(valor) { return escaparHtmlEbd(calData(valor)); }
function cpaDataHora(valor) { return escaparHtmlEbd(calDataHora(valor)); }
function cpaOpcoes(lista, valor, rotulo, placeholder) {
  return (placeholder != null ? `<option value="">${escaparHtmlEbd(placeholder)}</option>` : "")
    + lista.map(x => `<option value="${escaparHtmlEbd(valor(x))}">${escaparHtmlEbd(rotulo(x))}</option>`).join("");
}
function cpaPreencherSelect(id, lista, valor, rotulo, placeholder) {
  const sel = cpaEl(id);
  if (!sel) return;
  const atual = sel.value;
  sel.innerHTML = cpaOpcoes(lista, valor, rotulo, placeholder);
  if (atual && Array.from(sel.options).some(o => o.value === atual)) sel.value = atual;
}
function cpaRotuloDe(lista, codigo) {
  const achado = (lista || []).find(x => x && x.codigo === codigo);
  return achado ? String(achado.rotulo) : String(codigo == null ? "" : codigo);
}
function cpaRolarPara(id) {
  const el = cpaEl(id);
  if (el && typeof el.scrollIntoView === "function") el.scrollIntoView({ behavior: "smooth", block: "start" });
}
// Foco (teclado e leitor de tela): vai para o que acabou de abrir e volta ao botão de onde a pessoa saiu. O scroll fica com cpaRolarPara (suave).
function cpaFocar(el) {
  if (!el || typeof el.focus !== "function") return;
  try { el.focus({ preventScroll: true }); } catch { el.focus(); }
}
function cpaFocarId(id) { cpaFocar(cpaEl(id)); }
function cpaEscrever(id, texto, destaque) {
  const el = cpaEl(id);
  if (el) { el.textContent = texto; el.className = destaque ? "subtitle psc-aviso" : "subtitle"; }
}
function cpaMostrar(id, visivel) { const el = cpaEl(id); if (el) el.style.display = visivel ? "block" : "none"; }
function cpaEsvaziar(ids) { ids.forEach(id => { const el = cpaEl(id); if (el) el.innerHTML = ""; }); }
async function cpaProteger(botao, tarefa, chave) {
  if (chave) {
    if (cpaEmCurso.has(chave)) { mostrarToast("Aguarde: o pedido anterior ainda está sendo processado.", "erro"); return undefined; }
    cpaEmCurso.add(chave);
  }
  if (botao && typeof botao === "object") botao.disabled = true;
  try { return await tarefa(); } finally {
    if (botao && typeof botao === "object") botao.disabled = false;
    if (chave) cpaEmCurso.delete(chave);
  }
}
// Sim / Não / nenhum dos dois (null): toda escolha que o servidor exige explícita começa sem nada marcado
function cpaEscolhaSimNao(idSim, idNao) {
  const sim = cpaEl(idSim), nao = cpaEl(idNao);
  if (sim && sim.checked) return true;
  if (nao && nao.checked) return false;
  return null;
}
function cpaMarcado(id) { const el = cpaEl(id); return !!(el && el.checked); }
// O dia de hoje em Brasília pelo relógio do SERVIDOR (o aparelho pode estar com a data errada); sem ele, o do aparelho (calHojeBrasilia)
function cpaHojeDe(agoraIso) {
  const ms = Date.parse(agoraIso);
  if (Number.isFinite(ms)) return new Date(ms - 3 * 3600000).toISOString().slice(0, 10);
  return calHojeBrasilia();
}
// Texto livre que a pessoa digitou: sem < e >, dentro do tamanho. Devolve a mensagem do problema ou "".
function cpaProblemaTexto(texto, { nome, min = 0, max, obrigatorio = false }) {
  if (!texto) return obrigatorio ? `Escreva ${nome}.` : "";
  if (cpaTemMarca(texto)) return `Não use os sinais < e > em ${nome}.`;
  if (texto.length < min) return `${nome[0].toUpperCase()}${nome.slice(1)} está curto demais (pelo menos ${min} letras).`;
  if (texto.length > max) return `${nome[0].toUpperCase()}${nome.slice(1)} pode ter no máximo ${max} caracteres.`;
  return "";
}

// ---- chamadas à API (nunca lançam: erro de rede, tempo esgotado ou resposta que não é JSON viram { sucesso:false, mensagem }) ----
// Uma tentativa com o seu prazo de 20 s (AbortController + setTimeout: existe em todo navegador que roda o sistema). semFator: o 428 é tratado em cpaRequisitar, para o prazo
// não correr enquanto a pessoa confirma a chave de acesso ou digita o código do e-mail.
async function cpaTentar(url, opcoes) {
  const controle = typeof AbortController === "function" ? new AbortController() : null;
  const limite = controle ? setTimeout(() => controle.abort(), CPA_TEMPO_LIMITE_MS) : null;
  try {
    const res = await fetchProtegido(url, Object.assign({}, opcoes || {}, { semFator: true }, controle ? { signal: controle.signal } : {}));
    let corpo = null;
    try { corpo = await res.json(); } catch { corpo = null; }
    return { res, corpo };
  } finally {
    if (limite != null) clearTimeout(limite);
  }
}
async function cpaRequisitar(caminho, opcoes) {
  const url = `${API_BASE}/${CPA_ROTA}/${caminho}`;
  try {
    let r = await cpaTentar(url, opcoes);
    // 428: a confirmação reforçada da vD.4 — o MESMO fluxo do fetchProtegido (confirmarFatorAgora) e a chamada repetida UMA vez
    if (r.res.status === 428) {
      const ok = await confirmarFatorAgora();
      if (ok) r = await cpaTentar(url, opcoes);
    }
    const { res, corpo } = r;
    if (!corpo || typeof corpo !== "object" || Array.isArray(corpo)) return { sucesso: false, mensagem: `Resposta inesperada do servidor (${res.status}).`, httpStatus: res.status };
    if (res.status >= 400) corpo.sucesso = false;
    if (res.status === 428 || corpo.precisaFator) corpo.mensagem = CPA_MSG_FATOR;
    corpo.httpStatus = res.status;
    // 403 e erro de servidor (5xx) o fetchProtegido já avisou com um toast; repetir deixaria dois iguais na tela
    if (res.status === 403 || res.status >= 500) corpo.jaAvisado = true;
    return corpo;
  } catch (e) {
    // falha de rede e sessão expirada já foram avisadas por fetchProtegido (toast): aqui só vai o texto para a tela
    if (e && e.message === "Sessão expirada") return { sucesso: false, jaAvisado: true, sessaoExpirada: true, mensagem: "Sua sessão expirou. Entre novamente." };
    if (e && e.name === "AbortError") return { sucesso: false, jaAvisado: true, falhaDeRede: true, tempoEsgotado: true, mensagem: CPA_MSG_TEMPO };
    return { sucesso: false, jaAvisado: true, falhaDeRede: true, mensagem: CPA_MSG_REDE };
  }
}
function cpaObter(caminho) { return cpaRequisitar(caminho); }
function cpaPostar(caminho, corpo) {
  return cpaRequisitar(caminho, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo) });
}
// Toast + texto fixo na tela (textContent: nada de HTML). Quando o fetchProtegido já avisou (rede, sessão, 403, 5xx), só o texto vai para a tela.
function cpaMostrarResultado(data, idMensagem, destaque) {
  const texto = cpaMsgErro(data);
  const falhou = !!(data && data.sucesso === false);
  if (!(data && data.jaAvisado)) mostrarToast(texto, falhou ? "erro" : "sucesso");
  cpaEscrever(idMensagem, texto, destaque || falhou);
}

async function cpaGarantirCatalogos(forcar) {
  if (cpaCatalogos && !forcar) return cpaCatalogos;
  const geracao = cpaGeracao;
  const data = await cpaObter("catalogos");
  if (geracao !== cpaGeracao) return cpaCatalogos;   // a pessoa trocou de login enquanto o catálogo vinha: o dela é outro
  // falha ao recarregar: o catálogo que a tela já tinha continua valendo (zerá-lo deixava os formulários mortos)
  if (data.sucesso === false) { if (!forcar) cpaCatalogos = null; return cpaCatalogos; }
  const lista = (v) => (Array.isArray(v) ? v.filter(x => x && typeof x === "object" && typeof x.codigo === "string") : []);
  const papeis = data.papeis && typeof data.papeis === "object" ? data.papeis : {};
  const ajuda = Array.isArray(data.contatosDeAjuda) ? data.contatosDeAjuda.filter(x => x && typeof x === "object") : [];
  cpaCatalogos = {
    tipos: lista(data.tipos), formas: lista(data.formas), formasPresenciais: Array.isArray(data.formasPresenciais) ? data.formasPresenciais.map(x => String(x)) : ["VISITA_LAR", "VISITA_HOSPITAL"],
    desfechosConclusao: lista(data.desfechosConclusao), desfechosCancelamento: lista(data.desfechosCancelamento), niveisNota: lista(data.niveisNota), categorias: lista(data.categorias),
    paraQuem: lista(data.paraQuem), degraus: lista(data.degraus), contatosDeAjuda: ajuda.length ? ajuda : CPA_CONTATOS_PADRAO,
    limites: data.limites && typeof data.limites === "object" ? data.limites : {}, papeis: { gestao: !!papeis.gestao, geral: !!papeis.geral }
  };
  return cpaCatalogos;
}

// ---- troca de login e saída: não deixa o dado da pessoa anterior na tela ----
const CPA_IDS_LISTAS = ["cpaFilaLista", "cpaNovoCx", "cpaDetalheGes", "cpaDetalheMeu", "cpaPedLista", "cpaRegPedCx", "cpaBolImprimivel", "cpaPainelLista", "cpaMeusLista",
  "cpaOracaoForm", "cpaOracaoResultado", "cpaVisitaForm", "cpaVisitaResultado", "cpaMeusPedidos", "cpaBoletimMeu"];
const CPA_IDS_MENSAGENS = ["cpaGesMsg", "cpaFilaMsg", "cpaDetalheGesMsg", "cpaDetalheMeuMsg", "cpaPedMsg", "cpaBolMsg", "cpaPainelMsg", "cpaMeuMsg", "cpaMeusPedidosMsg"];
const CPA_IDS_SELECTS = ["cpaFiltroCong", "cpaFiltroTipo", "cpaPedCong", "cpaBolCong"];
function cpaLimparImpressao() { const c = document.body && document.body.classList; if (c) c.remove("cpa-imprimindo"); }
// Tudo o que é da aba da liderança: a fila, o acompanhamento aberto (e a nota aberta), os pedidos, o boletim e o painel.
function cpaFecharGestao() {
  cpaFecharDetalheInterno("Ges");
  cpaSeqFila++; cpaSeqPed++; cpaSeqBol++; cpaSeqPainel++; cpaSeqBusca++;
  cpaFila = []; cpaPedidos = []; cpaPedFormAberto = 0; cpaBuscaRes = {}; cpaEscolhas = {};
  cpaEsvaziar(["cpaFilaLista", "cpaNovoCx", "cpaDetalheGes", "cpaPedLista", "cpaRegPedCx", "cpaBolImprimivel", "cpaPainelLista"]);
  ["cpaFilaMsg", "cpaDetalheGesMsg", "cpaPedMsg", "cpaBolMsg", "cpaPainelMsg"].forEach(id => cpaEscrever(id, "", false));
  cpaMostrar("cpaDetalheGesCx", false); cpaMostrar("cpaFilaCx", true);
  cpaLimparImpressao();
}
// Tudo o que é de Meu Painel → Cuidado: meus acompanhamentos (e o aberto), o que a pessoa escrevia nos pedidos, os pedidos dela e o boletim.
function cpaFecharMeu() {
  cpaFecharDetalheInterno("Meu");
  cpaSeqMeu++; cpaSeqMeusLista++; cpaSeqMeusPed++; cpaSeqBolMeu++;
  cpaMeus = [];
  cpaEsvaziar(["cpaMeusLista", "cpaDetalheMeu", "cpaOracaoForm", "cpaOracaoResultado", "cpaVisitaForm", "cpaVisitaResultado", "cpaMeusPedidos", "cpaBoletimMeu"]);
  ["cpaMeuMsg", "cpaDetalheMeuMsg", "cpaMeusPedidosMsg"].forEach(id => cpaEscrever(id, "", false));
  cpaMostrar("cpaMeusCx", false); cpaMostrar("cpaDetalheMeuCx", false); cpaMostrar("cpaMeusListaCx", true);
}
function cpaLimparTela() {
  cpaGeracao++;
  cpaFecharGestao();
  cpaFecharMeu();
  cpaCatalogos = null; cpaCongregacoes = []; cpaSecaoAtual = "fila"; cpaSituacaoPedidos = "AGUARDANDO"; cpaDet = null; cpaNotas = [];
  cpaGatilhoForm = null; cpaGatilhoDetalhe = null;
  // pedidos que ainda estão a caminho trazem dado do login anterior: a resposta velha é descartada
  cpaSeqFila++; cpaSeqDet++; cpaSeqNotas++; cpaSeqNota++; cpaSeqLeit++; cpaSeqPed++; cpaSeqBol++; cpaSeqPainel++; cpaSeqMeu++; cpaSeqMeusPed++; cpaSeqBolMeu++; cpaSeqBusca++;
  cpaEmCurso.clear();
  CPA_IDS_LISTAS.forEach(id => { const el = cpaEl(id); if (el) el.innerHTML = ""; });
  CPA_IDS_MENSAGENS.forEach(id => cpaEscrever(id, "", false));
  CPA_IDS_SELECTS.forEach(id => { const el = cpaEl(id); if (el) el.innerHTML = ""; });
  const filtro = cpaEl("cpaFiltroSituacao");
  if (filtro) filtro.value = "ABERTOS";
  cpaMostrar("cpaSemAcesso", false);
  cpaAplicarSecao("fila");
  cpaAplicarPilulasPedidos();
  cpaLimparImpressao();
}
// De quem é a tela: a matrícula E o tipo de sessão (senha de liderança × PIN): o mesmo líder por PIN e por senha tem outros papéis.
function cpaChaveDoDono() { return `${authMatricula}|${sessaoDeLiderancaNaTela() ? "senha" : "pin"}`; }
function cpaVerificarDono() {
  if (cpaDono !== cpaChaveDoDono()) { cpaLimparTela(); cpaDono = cpaChaveDoDono(); }
}
// a navegação avisa o módulo ANTES de trocar de tela (mostrarAbaSecretaria / mostrarSubAbaMeupainel): o que não está mais à vista sai da página
function cpaAbaMudou(aba) {
  if (aba !== "cuidadopastoral") cpaFecharGestao();
  if (aba !== "meupainel") cpaFecharMeu();
}
function cpaSubAbaMudou(sub) {
  if (sub !== "cuidado") cpaFecharMeu();
}
function cpaAbaVisivel() {
  const aba = cpaEl("abaCuidadopastoral");
  return !!(authToken && cpaDono === cpaChaveDoDono() && aba && aba.style.display === "block");
}
function cpaMeuVisivel() {
  const sub = cpaEl("subMeupainelCuidado");
  return !!(authToken && cpaDono === cpaChaveDoDono() && sub && sub.style.display === "block");
}

// ============================================================================
// PEDAÇOS DE TELA USADOS NAS DUAS TELAS
// ============================================================================
// os telefones de ajuda: o endereço tel: leva só os algarismos
function cpaHtmlContatos(lista) {
  const itens = Array.isArray(lista) && lista.length ? lista : (cpaCatalogos ? cpaCatalogos.contatosDeAjuda : CPA_CONTATOS_PADRAO);
  return `<ul class="cpa-contatos-lista">${itens.map(c => {
    const digitos = String(c && c.numero != null ? c.numero : "").replace(/\D/g, "").slice(0, 8);
    const nome = escaparHtmlEbd(c && c.nome);
    const descricao = escaparHtmlEbd(c && c.descricao);
    return digitos
      ? `<li><a class="cpa-tel" href="${urlSegura(`tel:${digitos}`)}">📞 <strong>${escaparHtmlEbd(digitos)}</strong> ${nome}</a><span class="cpa-tel-desc">${descricao}</span></li>`
      : `<li><strong>${nome}</strong><span class="cpa-tel-desc">${descricao}</span></li>`;
  }).join("")}</ul>`;
}
function cpaHtmlAjudaFixa() {
  return `<div class="cpa-ajuda" role="group" aria-label="Telefones de ajuda">
    <p class="cpa-ajuda-titulo"><strong>Precisa de ajuda agora?</strong> Estes telefones atendem de graça:</p>
    ${cpaHtmlContatos(null)}
  </div>`;
}
// o contato do acompanhamento: telefone vira link de ligar (só os algarismos no endereço); o resto fica como texto
function cpaHtmlContato(valor) {
  const texto = String(valor == null ? "" : valor).trim();
  if (!texto) return "<span class='psc-legenda'>sem contato no cadastro</span>";
  return texto.split(" · ").map(parte => {
    const digitos = parte.replace(/\D/g, "");
    return !parte.includes("@") && digitos.length >= 8 && digitos.length <= 13
      ? `<a class="cpa-tel-linha" href="${urlSegura(`tel:${digitos}`)}">📞 ${escaparHtmlEbd(parte)}</a>` : escaparHtmlEbd(parte);
  }).join(" · ");
}
function cpaClasseFaixa(faixa) { return cpaTem(CPA_CLASSE_FAIXA, faixa) ? CPA_CLASSE_FAIXA[faixa] : "cal-st-cancelado"; }
function cpaIconeFaixa(faixa) { return cpaTem(CPA_ICONE_FAIXA, faixa) ? CPA_ICONE_FAIXA[faixa] : "⏳"; }
function cpaRotuloStatus(status) { return cpaTem(CPA_ROTULO_STATUS, status) ? CPA_ROTULO_STATUS[status] : String(status == null ? "" : status); }
// o prazo é calculado pelo SERVIDOR na leitura (item.prazo: { faixa, texto }): a tela só pinta
function cpaHtmlPrazo(i) {
  const p = i && i.prazo && typeof i.prazo === "object" ? i.prazo : null;
  if (!p || !p.texto) return "";
  return cpaSelo(cpaClasseFaixa(p.faixa), `${cpaIconeFaixa(p.faixa)} ${p.texto}`);
}
function cpaTextoDegrau(i) { return cpaTem(CPA_DEGRAU_CURTO, i.nivel) ? CPA_DEGRAU_CURTO[i.nivel] : String(i.nivelRotulo || i.nivel || ""); }
function cpaSelosDoItem(i) {
  const s = [];
  if (i.urgente) s.push(cpaSelo("cal-st-indeferido cpa-urgente", "🚨 URGENTE"));
  if (i.soNivelGeral) s.push(cpaSelo("cal-st-indeferido", "🔒 só o nível geral vê"));
  if (i.status && i.status !== "ABERTO") s.push(cpaSelo("cal-st-cancelado", `${cpaRotuloStatus(i.status)}${i.desfechoRotulo ? `: ${i.desfechoRotulo}` : ""}`));
  s.push(cpaHtmlPrazo(i));
  if (i.status === "ABERTO" && i.nivel && i.nivel !== "CONGREGACAO") s.push(cpaSelo("cal-st-proposto", `⬆️ subiu para ${cpaTextoDegrau(i)}`));
  if (i.origem === "DETECCAO") s.push(cpaSelo("cal-st-deferido", "📉 Detectado pelo sistema"));
  if (i.menor) s.push(cpaSelo("cal-st-proposto", "🧒 menor de idade"));
  return s.join("");
}
function cpaHtmlResponsavel(i) {
  return i.responsavel && typeof i.responsavel === "object" && i.responsavel.nome ? escaparHtmlEbd(i.responsavel.nome) : "<strong class='cpa-sem-resp'>SEM RESPONSÁVEL</strong>";
}
// o cartão de um acompanhamento na fila (Ges) ou em Meus acompanhamentos (Meu: com o contato e o motivo, que o responsável precisa para procurar a pessoa)
function cpaHtmlCartao(i, ctxBruto) {
  const ctx = cpaCtx(ctxBruto);
  // o encerrado nos últimos 30 dias, em Meus acompanhamentos: só a lembrança (tipo, primeiro nome, desfecho) — o servidor não abre mais o item para o voluntário
  if (ctx === "Meu" && (i.encerrado === true || i.status !== "ABERTO")) {
    return `<div class="cal-cartao cpa-cartao cpa-cartao-encerrado">
    <h5>${escaparHtmlEbd(i.pessoaNome || "(sem nome)")}</h5>
    <p class="cpa-linha">${escaparHtmlEbd(i.tipoRotulo)} · ${escaparHtmlEbd(cpaRotuloStatus(i.status))}${i.desfechoRotulo ? `: ${escaparHtmlEbd(i.desfechoRotulo)}` : ""}${i.encerradoEm ? ` (${cpaData(i.encerradoEm)})` : ""}</p>
  </div>`;
  }
  const extra = ctx === "Meu"
    ? `${i.contato ? `<p class="cpa-linha">Contato: ${cpaHtmlContato(i.contato)}</p>` : ""}${i.motivo ? `<p class="cpa-linha">Motivo: ${escaparHtmlEbd(i.motivo)}</p>` : ""}`
    : `<p class="cpa-linha">Responsável: ${cpaHtmlResponsavel(i)}</p>`;
  return `<div class="cal-cartao cpa-cartao${i.urgente ? " cpa-cartao-urgente" : ""}">
    <h5>${escaparHtmlEbd(i.pessoaNome || "(sem nome)")}</h5>
    <div class="cpa-selos">${cpaSelosDoItem(i)}</div>
    <p class="cpa-linha">${escaparHtmlEbd(i.tipoRotulo)} · Congregação ${escaparHtmlEbd(i.congregacaoNome)}</p>
    ${extra}
    ${i.origem === "DETECCAO" && i.deteccaoResumo ? `<p class="cpa-linha cpa-deteccao">📉 Detectado pelo sistema: ${escaparHtmlEbd(i.deteccaoResumo)}</p>` : ""}
    <div class="psc-acoes"><button type="button" class="btn-confirmar cpa-btn" data-on-click="cpaAbrirDetalheAcao" data-args-click="${argsAttr(ctx, Number(i.itemId), ARG.elemento)}">📂 Abrir acompanhamento</button></div>
  </div>`;
}

// ============================================================================
// 1) A ABA DA LIDERANÇA
// ============================================================================
// Chamada pela navegação (mostrarAbaSecretaria) ao abrir a aba.
async function cpaCarregarOpcoesAcao() {
  cpaVerificarDono();
  if (!cpaPodeAba()) return;
  const geracao = cpaGeracao;
  cpaEscrever("cpaGesMsg", "Carregando…", false);
  const [catalogo, congs] = await Promise.all([cpaGarantirCatalogos(true), cpaObter("congregacoes")]);
  // a pessoa saiu da aba (ou da sessão) enquanto vinha: nada é montado fora da aba
  if (geracao !== cpaGeracao || !cpaAbaVisivel()) return;
  if (!catalogo) { cpaEscrever("cpaGesMsg", CPA_MSG_SEM_CATALOGO, true); return; }
  cpaEscrever("cpaGesMsg", "", false);
  if (!catalogo.papeis.gestao) {
    cpaMostrar("cpaSemAcesso", true);
    CPA_SECOES.forEach(s => cpaMostrar(`cpaSecao${s[0].toUpperCase()}${s.slice(1)}`, false));
    cpaMostrar("cpaPilulas", false);
    return;
  }
  cpaMostrar("cpaSemAcesso", false); cpaMostrar("cpaPilulas", true);
  cpaCongregacoes = congs.sucesso !== false && Array.isArray(congs.congregacoes) ? congs.congregacoes.filter(c => c && typeof c === "object" && cpaInteiro(c.congregacaoId)) : [];
  if (congs.sucesso === false) cpaEscrever("cpaGesMsg", `Não foi possível carregar as congregações: ${cpaMsgErro(congs)}`, true);
  ["cpaFiltroCong", "cpaPedCong", "cpaBolCong"].forEach(id => cpaPreencherSelect(id, cpaCongregacoes, c => String(Number(c.congregacaoId)), c => c.nome, "Todas as congregações"));
  cpaPreencherSelect("cpaFiltroTipo", catalogo.tipos, t => t.codigo, t => t.rotulo, "Todos os tipos");
  cpaFecharDetalheInterno("Ges");   // abrir a aba (ou tocar nela de novo) sempre volta à lista: uma nota aberta não fica à espera
  cpaMostrarSecaoAcao(cpaSecaoAtual);
}
function cpaAplicarSecao(secao) {
  CPA_SECOES.forEach(s => {
    const nome = `${s[0].toUpperCase()}${s.slice(1)}`;
    cpaMostrar(`cpaSecao${nome}`, s === secao);
    const b = cpaEl(`btnCpaSecao${nome}`);
    if (b) { b.classList.toggle("ativo", s === secao); b.setAttribute("aria-pressed", s === secao ? "true" : "false"); }
  });
}
function cpaMostrarSecaoAcao(secaoBruta) {
  const secao = CPA_SECOES.includes(secaoBruta) ? secaoBruta : "fila";
  if (!cpaEhGestao()) return;
  // trocar de seção (ou tocar de novo nela) fecha o acompanhamento aberto (e a nota) e tira da página os textos dos pedidos: nada fica à espera escondido
  cpaFecharDetalheInterno("Ges");
  if (secao !== "pedidos") { cpaSeqPed++; cpaPedidos = []; cpaPedFormAberto = 0; cpaEsvaziar(["cpaPedLista", "cpaRegPedCx"]); cpaEscrever("cpaPedMsg", "", false); }
  if (secao !== "fila") { cpaSeqFila++; cpaSeqBusca++; cpaFila = []; cpaBuscaRes = {}; cpaEscolhas = {}; cpaEsvaziar(["cpaFilaLista", "cpaNovoCx"]); cpaEscrever("cpaFilaMsg", "", false); }
  cpaSecaoAtual = secao;
  cpaAplicarSecao(secao);
  if (secao === "fila") cpaCarregarFilaAcao();
  if (secao === "pedidos") cpaCarregarPedidosAcao();
  if (secao === "boletim") cpaCarregarBoletimAcao();
  if (secao === "painel") cpaCarregarPainelAcao();
}

// -- a) a fila --
function cpaFiltrosFila() {
  const s = cpaTexto("cpaFiltroSituacao");
  const tipo = cpaTexto("cpaFiltroTipo");
  const tipos = cpaCatalogos ? cpaCatalogos.tipos.map(t => t.codigo) : [];
  return { situacao: CPA_SITUACOES_FILA.includes(s) ? s : "ABERTOS", congregacaoId: cpaInteiro(cpaTexto("cpaFiltroCong")), tipo: tipos.includes(tipo) ? tipo : "" };
}
async function cpaCarregarFilaAcao() {
  if (!cpaEhGestao()) return;
  const f = cpaFiltrosFila();
  const consulta = [`situacao=${encodeURIComponent(f.situacao)}`];
  if (f.congregacaoId) consulta.push(`congregacaoId=${f.congregacaoId}`);
  if (f.tipo) consulta.push(`tipo=${encodeURIComponent(f.tipo)}`);
  const seq = ++cpaSeqFila;
  cpaEscrever("cpaFilaMsg", "Carregando…", false);
  const data = await cpaObter(`fila?${consulta.join("&")}`);
  if (seq !== cpaSeqFila) return;   // resposta velha: filtro trocado, aba fechada ou outro login
  const lista = cpaEl("cpaFilaLista");
  if (data.sucesso === false || !Array.isArray(data.itens)) {
    cpaFila = [];
    if (lista) lista.innerHTML = "";
    cpaMostrarResultado(data, "cpaFilaMsg", true);
    return;
  }
  cpaFila = data.itens.filter(i => i && typeof i === "object" && cpaInteiro(i.itemId));
  const n = cpaFila.length;
  cpaEscrever("cpaFilaMsg", n ? `${n} ${n === 1 ? "acompanhamento" : "acompanhamentos"}${n >= 400 ? " (mostrando os 400 primeiros: use os filtros)" : ""}.` : "Nenhum acompanhamento nesta situação.", false);
  if (lista) lista.innerHTML = cpaFila.map(i => cpaHtmlCartao(i, "Ges")).join("");
}

// -- abrir um acompanhamento à mão --
function cpaTiposManuais() { return cpaCatalogos ? cpaCatalogos.tipos.filter(t => t.manual) : []; }
function cpaAbrirFormNovoAcao(gatilho) {
  const cx = cpaEl("cpaNovoCx");
  if (!cx || !cpaEhGestao()) return;
  if (cx.innerHTML !== "") { cpaFocarId("cpaNovoTipo"); return; }   // já aberto: não apaga o que a pessoa escreveu
  cpaGatilhoForm = gatilho && typeof gatilho === "object" ? gatilho : null;
  cpaBuscaRes.novoPessoa = []; cpaBuscaRes.novoResp = []; cpaEscolhas.novoPessoa = null; cpaEscolhas.novoResp = null;
  const congAtual = cpaInteiro(cpaTexto("cpaFiltroCong")) || (cpaCongregacoes.length === 1 ? Number(cpaCongregacoes[0].congregacaoId) : 0);
  cx.innerHTML = `<div class="cal-form cpa-form" role="group" aria-labelledby="cpaNovoTitulo">
    <h5 id="cpaNovoTitulo">➕ Abrir acompanhamento</h5>
    <p class="psc-legenda">Para quem precisa que alguém da igreja procure: quem visitou, quem aceitou a Jesus, quem deixou de vir, quem pediu visita ou saiu do hospital.</p>
    <div class="cal-form-grade">
      <div class="input-group">
        <label for="cpaNovoTipo">Tipo de acompanhamento</label>
        <select id="cpaNovoTipo" data-on-change="cpaMudouTipoNovoAcao">${cpaOpcoes(cpaTiposManuais(), t => t.codigo, t => t.rotulo, "Escolha o tipo")}</select>
      </div>
      <div class="input-group">
        <label for="cpaNovoCong">Congregação</label>
        <select id="cpaNovoCong" data-on-change="cpaMudouCongNovoAcao">${cpaOpcoes(cpaCongregacoes, c => String(Number(c.congregacaoId)), c => c.nome, "Escolha a congregação")}</select>
      </div>
    </div>
    <p id="cpaNovoTipoDesc" class="psc-legenda" role="note"></p>
    <fieldset class="cpa-grupo">
      <legend>A pessoa está no cadastro da igreja?</legend>
      <label class="cpa-opcao"><input type="radio" name="cpaNovoCad" id="cpaNovoCadSim" value="sim" data-on-change="cpaMudouCadastroNovoAcao" /> Sim, é membro (vou buscar pelo nome)</label>
      <label class="cpa-opcao"><input type="radio" name="cpaNovoCad" id="cpaNovoCadNao" value="nao" data-on-change="cpaMudouCadastroNovoAcao" /> Não (visitante ou novo convertido): vou escrever o nome e o contato</label>
    </fieldset>
    <div id="cpaNovoMembroCx" style="display:none;">
      <div class="input-group">
        <label for="cpaNovoBusca">Nome da pessoa (pelo menos 2 letras)</label>
        <input type="text" id="cpaNovoBusca" maxlength="60" autocomplete="off" />
      </div>
      <div class="psc-acoes"><button type="button" class="btn-confirmar btn-secundario cpa-btn" data-on-click="cpaBuscarAcao" data-args-click="${argsAttr("novoPessoa", ARG.elemento)}">🔍 Buscar</button></div>
      <div id="cpaNovoBuscaRes" role="status" aria-live="polite"></div>
      <p id="cpaNovoEscolhido" class="cpa-escolhido" role="status"></p>
    </div>
    <div id="cpaNovoForaCx" style="display:none;">
      <div class="cal-form-grade">
        <div class="input-group">
          <label for="cpaNovoNome">Nome da pessoa</label>
          <input type="text" id="cpaNovoNome" maxlength="${cpaLimite("nome")}" autocomplete="off" />
        </div>
        <div class="input-group">
          <label for="cpaNovoContato">Telefone, WhatsApp ou e-mail</label>
          <input type="text" id="cpaNovoContato" maxlength="${cpaLimite("contato")}" autocomplete="off" />
        </div>
      </div>
      <p class="psc-legenda">Sem um contato ninguém consegue procurar a pessoa. Quem não é do cadastro não vira membro por aqui.</p>
    </div>
    <div class="input-group">
      <label for="cpaNovoMotivo">Motivo (opcional, até ${cpaLimite("motivo")} caracteres)</label>
      <textarea id="cpaNovoMotivo" rows="3" maxlength="${cpaLimite("motivo")}" autocomplete="off"></textarea>
      <p class="psc-legenda">Escreva o que ajuda a procurar (ex.: "visitou no domingo com a família"). Não escreva diagnóstico nem segredo: para isso existem as notas pastorais.</p>
    </div>
    <fieldset class="cpa-grupo">
      <legend>Responsável (opcional)</legend>
      <p class="psc-legenda">Se ninguém for escolhido, o Dirigente da congregação fica como responsável. Pode ser qualquer membro maior de idade da congregação (um diácono, uma irmã do círculo de oração) ou alguém da liderança.</p>
      <div class="input-group">
        <label for="cpaNovoRespBusca">Nome do responsável</label>
        <input type="text" id="cpaNovoRespBusca" maxlength="60" autocomplete="off" />
      </div>
      <div class="psc-acoes"><button type="button" class="btn-confirmar btn-secundario cpa-btn" data-on-click="cpaBuscarAcao" data-args-click="${argsAttr("novoResp", ARG.elemento)}">🔍 Buscar responsável</button></div>
      <div id="cpaNovoRespRes" role="status" aria-live="polite"></div>
      <p id="cpaNovoRespEscolhido" class="cpa-escolhido" role="status"></p>
    </fieldset>
    <label class="cpa-opcao" for="cpaNovoUrgente"><input type="checkbox" id="cpaNovoUrgente" /> Urgente (prazo de 24 horas)</label>
    <div class="psc-acoes">
      <button type="button" class="btn-confirmar cpa-btn" id="cpaNovoBotao" data-on-click="cpaEnviarNovoAcao" data-args-click="${argsAttr(ARG.elemento)}">✅ Abrir o acompanhamento</button>
      <button type="button" class="btn-confirmar btn-secundario cpa-btn" data-on-click="cpaFecharNovoAcao">Cancelar</button>
    </div>
    <p id="cpaNovoMsg" class="subtitle" role="status" aria-live="polite"></p>
  </div>`;
  if (congAtual) { const sel = cpaEl("cpaNovoCong"); if (sel) sel.value = String(congAtual); }
  cpaRolarPara("cpaNovoCx");
  cpaFocarId("cpaNovoTipo");
}
function cpaFecharNovoAcao() {
  const cx = cpaEl("cpaNovoCx");
  if (cx) cx.innerHTML = "";
  cpaBuscaRes.novoPessoa = []; cpaBuscaRes.novoResp = []; cpaEscolhas.novoPessoa = null; cpaEscolhas.novoResp = null;
  const gatilho = cpaGatilhoForm;
  cpaGatilhoForm = null;
  if (gatilho && gatilho.isConnected) cpaFocar(gatilho);
}
function cpaMudouTipoNovoAcao() {
  const tipo = cpaTexto("cpaNovoTipo");
  const t = cpaTiposManuais().find(x => x.codigo === tipo);
  const desc = cpaEl("cpaNovoTipoDesc");
  if (desc) desc.textContent = t ? `${t.descricao || ""}${t.soMembro ? " Este tipo é só para quem está no cadastro." : ""}` : "";
  if (t && t.soMembro) { const sim = cpaEl("cpaNovoCadSim"), nao = cpaEl("cpaNovoCadNao"); if (sim) sim.checked = true; if (nao) nao.checked = false; cpaMudouCadastroNovoAcao(); }
}
function cpaMudouCadastroNovoAcao() {
  const sim = cpaEscolhaSimNao("cpaNovoCadSim", "cpaNovoCadNao");
  cpaMostrar("cpaNovoMembroCx", sim === true);
  cpaMostrar("cpaNovoForaCx", sim === false);
}
// trocar a congregação apaga as pessoas escolhidas (a busca é por congregação)
function cpaMudouCongNovoAcao() {
  ["novoPessoa", "novoResp"].forEach(alvo => { cpaBuscaRes[alvo] = []; cpaEscolhas[alvo] = null; });
  cpaEsvaziar(["cpaNovoBuscaRes", "cpaNovoRespRes"]);
  ["cpaNovoEscolhido", "cpaNovoRespEscolhido"].forEach(id => { const el = cpaEl(id); if (el) el.textContent = ""; });
}

// -- a busca de pessoas (para abrir, nomear o responsável e registrar o pedido recebido em mãos) --
function cpaAlvoBusca(bruto) { return cpaTem(CPA_BUSCAS, bruto) ? bruto : ""; }
function cpaCongDaBusca(alvo) {
  if (alvo === "troca") return cpaDet && cpaDet.dados && cpaDet.dados.item ? cpaInteiro(cpaDet.dados.item.congregacaoId) : 0;
  return cpaInteiro(cpaTexto(CPA_BUSCAS[alvo].cong));
}
async function cpaBuscarAcao(alvoBruto, botao) {
  const alvo = cpaAlvoBusca(alvoBruto);
  if (!alvo) return;
  const cfg = CPA_BUSCAS[alvo];
  const res = cpaEl(cfg.res);
  if (!res) return;
  const q = cpaTexto(cfg.campo);
  const congregacaoId = cpaCongDaBusca(alvo);
  if (!congregacaoId) { res.textContent = "Escolha a congregação antes de buscar."; return; }
  if (q.length < 2 || q.length > 60 || /[<>%_[\]]/.test(q)) { res.textContent = "Digite pelo menos 2 letras do nome (sem sinais como < > % _ [ ])."; return; }
  const seq = ++cpaSeqBusca;
  res.textContent = "Buscando…";
  await cpaProteger(botao, async () => {
    const data = await cpaPostar("buscar-pessoas", { congregacaoId, q });   // por POST: o nome não vai no endereço
    if (seq !== cpaSeqBusca || !cpaEl(cfg.res)) return;
    if (data.sucesso === false || !Array.isArray(data.pessoas)) { res.textContent = cpaMsgErro(data); return; }
    const pessoas = data.pessoas.filter(p => p && typeof p === "object" && cpaInteiro(p.membroId) && (!cfg.soMaior || p.maior === true));
    cpaBuscaRes[alvo] = pessoas;
    if (!pessoas.length) { res.textContent = cfg.soMaior ? "Ninguém encontrado (o responsável precisa ser maior de idade e ativo nesta congregação, ou da liderança)." : "Ninguém encontrado com esse nome nesta congregação."; return; }
    const rotuloBotao = alvo === "troca" ? "Nomear" : "Escolher";
    res.innerHTML = `<ul class="cpa-busca-lista">${pessoas.map(p => `<li>
      <span class="cpa-busca-nome">${escaparHtmlEbd(p.nome)}</span>${p.lideranca ? cpaSelo("cal-st-deferido", "liderança") : ""}${p.maior === false ? cpaSelo("cal-st-proposto", "menor de idade") : ""}
      <button type="button" class="btn-confirmar btn-secundario cpa-btn" data-on-click="cpaEscolherPessoaAcao" data-args-click="${argsAttr(alvo, Number(p.membroId), ARG.elemento)}">${rotuloBotao}</button>
    </li>`).join("")}</ul>`;
  }, `busca-${alvo}`);
}
async function cpaEscolherPessoaAcao(alvoBruto, membroId, botao) {
  const alvo = cpaAlvoBusca(alvoBruto);
  const id = cpaInteiro(membroId);
  if (!alvo || !id) return;
  const p = (cpaBuscaRes[alvo] || []).find(x => Number(x.membroId) === id);
  if (!p) return;
  if (alvo === "troca") { await cpaEnviarTrocaAcao(id, botao); return; }
  cpaEscolhas[alvo] = { membroId: id, nome: String(p.nome == null ? "" : p.nome) };
  const cfg = CPA_BUSCAS[alvo];
  const el = cpaEl(cfg.escolhido);
  if (el) el.textContent = `Escolhido(a): ${cpaEscolhas[alvo].nome}`;
  const res = cpaEl(cfg.res);
  if (res) res.innerHTML = "";
  cpaBuscaRes[alvo] = [];
}

function cpaLerNovo() {
  const tipo = cpaTexto("cpaNovoTipo");
  const t = cpaTiposManuais().find(x => x.codigo === tipo);
  const congregacaoId = cpaInteiro(cpaTexto("cpaNovoCong"));
  const cadastro = cpaEscolhaSimNao("cpaNovoCadSim", "cpaNovoCadNao");
  const motivo = cpaTexto("cpaNovoMotivo");
  const corpo = { tipo, congregacaoId, urgente: cpaMarcado("cpaNovoUrgente") };
  if (!t) return { problema: "Escolha o tipo do acompanhamento." };
  if (!congregacaoId) return { problema: "Escolha a congregação." };
  if (cadastro == null) return { problema: "Diga se a pessoa está no cadastro da igreja." };
  if (t.soMembro && cadastro === false) return { problema: `"${t.rotulo}" é só para quem está no cadastro: busque a pessoa pelo nome.` };
  if (cadastro) {
    if (!cpaEscolhas.novoPessoa) return { problema: "Busque a pessoa pelo nome e toque em Escolher." };
    corpo.membroId = cpaEscolhas.novoPessoa.membroId;
  } else {
    const nome = cpaTexto("cpaNovoNome"), contato = cpaTexto("cpaNovoContato");
    const p = cpaProblemaTexto(nome, { nome: "o nome da pessoa", min: 2, max: cpaLimite("nome"), obrigatorio: true })
      || cpaProblemaTexto(contato, { nome: "um contato (telefone ou e-mail)", min: 4, max: cpaLimite("contato"), obrigatorio: true });
    if (p) return { problema: p };
    corpo.pessoaNome = nome; corpo.pessoaContato = contato;
  }
  const pm = cpaProblemaTexto(motivo, { nome: "o motivo", min: 3, max: cpaLimite("motivo") });
  if (pm) return { problema: pm };
  if (motivo) corpo.motivo = motivo;
  if (cpaEscolhas.novoResp) corpo.responsavelMembroId = cpaEscolhas.novoResp.membroId;
  return { corpo };
}
async function cpaEnviarNovoAcao(botao) {
  const lido = cpaLerNovo();
  if (lido.problema) { cpaEscrever("cpaNovoMsg", lido.problema, true); return; }
  const geracao = cpaGeracao;
  await cpaProteger(botao, async () => {
    cpaEscrever("cpaNovoMsg", "Gravando…", false);
    const data = await cpaPostar("abrir", lido.corpo);
    if (geracao !== cpaGeracao) return;
    if (data.sucesso === false) { cpaMostrarResultado(data, "cpaNovoMsg", true); return; }
    cpaFecharNovoAcao();
    cpaMostrarResultado(data, "cpaFilaMsg", !(data.responsavel && data.responsavel.nome));
    const msg = cpaMsgErro(data);
    await cpaCarregarFilaAcao();
    if (geracao === cpaGeracao) cpaEscrever("cpaFilaMsg", msg, !(data.responsavel && data.responsavel.nome));
  }, "abrir");
}

// ============================================================================
// O ACOMPANHAMENTO ABERTO (liderança e responsável)
// ============================================================================
function cpaIdsDoCtx(ctx) {
  return ctx === "Meu" ? { cx: "cpaDetalheMeuCx", conteudo: "cpaDetalheMeu", msg: "cpaDetalheMeuMsg", lista: "cpaMeusListaCx" }
    : { cx: "cpaDetalheGesCx", conteudo: "cpaDetalheGes", msg: "cpaDetalheGesMsg", lista: "cpaFilaCx" };
}
function cpaLimparNota() {
  cpaSeqNota++;
  const corpo = cpaEl("cpaNotaCorpo"), cx = cpaEl("cpaNotaCx");
  if (corpo) corpo.textContent = "";
  if (cx) cx.style.display = "none";
}
// Fecha o acompanhamento do contexto: o conteúdo (e a nota aberta, e os formulários) sai do DOM, e uma resposta que ainda esteja a caminho não entra depois.
function cpaFecharDetalheInterno(ctxBruto) {
  const ctx = cpaCtx(ctxBruto);
  const ids = cpaIdsDoCtx(ctx);
  if ((cpaDet && cpaDet.ctx === ctx) || cpaDetCarregando === ctx) {
    cpaLimparNota();
    cpaDet = null; cpaNotas = []; cpaDetCarregando = "";
    cpaSeqDet++; cpaSeqNotas++; cpaSeqLeit++;
    cpaBuscaRes.troca = [];
    cpaGatilhoForm = null;
  }
  const conteudo = cpaEl(ids.conteudo);
  if (conteudo) conteudo.innerHTML = "";
  cpaEscrever(ids.msg, "", false);
  cpaMostrar(ids.cx, false);
  cpaMostrar(ids.lista, true);
}
function cpaFecharDetalheAcao(ctxBruto) {
  const ctx = cpaCtx(ctxBruto);
  cpaFecharDetalheInterno(ctx);
  if (ctx === "Meu") cpaRenderMeus();   // a lista volta com o que mudou enquanto o acompanhamento estava aberto
  const gatilho = cpaGatilhoDetalhe;
  cpaGatilhoDetalhe = null;
  if (gatilho && gatilho.isConnected) cpaFocar(gatilho);
  else cpaFocarId(ctx === "Meu" ? "cpaMeusTitulo" : "cpaFilaTitulo");
}
async function cpaAbrirDetalheAcao(ctxBruto, itemId, gatilho) {
  const ctx = cpaCtx(ctxBruto);
  const id = cpaInteiro(itemId);
  if (!id) return;
  if (ctx === "Ges" && !cpaEhGestao()) return;
  cpaFecharDetalheInterno(ctx === "Ges" ? "Meu" : "Ges");   // um só acompanhamento aberto por vez
  cpaFecharDetalheInterno(ctx);
  cpaGatilhoDetalhe = gatilho && typeof gatilho === "object" ? gatilho : null;
  await cpaCarregarDetalhe(ctx, id, true);
}
// Lê o acompanhamento e desenha. Devolve true quando desenhou.
async function cpaCarregarDetalhe(ctxBruto, itemId, focar) {
  const ctx = cpaCtx(ctxBruto);
  const id = cpaInteiro(itemId);
  const ids = cpaIdsDoCtx(ctx);
  const seq = ++cpaSeqDet;
  cpaDetCarregando = ctx;
  cpaLimparNota();
  cpaMostrar(ids.lista, false);
  cpaMostrar(ids.cx, true);
  cpaEscrever(ids.msg, "Carregando…", false);
  const data = await cpaObter(`item?itemId=${id}`);
  if (seq !== cpaSeqDet) return false;   // a pessoa trocou de acompanhamento, voltou, saiu da aba ou trocou de login
  cpaDetCarregando = "";
  const conteudo = cpaEl(ids.conteudo);
  if (data.sucesso === false || !data.item || typeof data.item !== "object") {
    cpaDet = null; cpaNotas = [];
    if (conteudo) conteudo.innerHTML = "";
    if (data.httpStatus === 404) cpaEscrever(ids.msg, CPA_MSG_NAO_ABRIU, true); else cpaMostrarResultado(data, ids.msg, true);
    return false;
  }
  cpaDet = { ctx, itemId: id, dados: data };
  cpaNotas = Array.isArray(data.notas) ? data.notas.filter(n => n && typeof n === "object" && cpaInteiro(n.notaId)) : [];
  cpaEscrever(ids.msg, "", false);
  cpaRenderDetalhe();
  if (focar) { cpaRolarPara(ids.cx); cpaFocarId("cpaDetTitulo"); }
  return true;
}
function cpaRotuloEvento(tipo) { return cpaTem(CPA_ROTULO_EVENTO, tipo) ? CPA_ROTULO_EVENTO[tipo] : String(tipo == null ? "" : tipo); }
function cpaHtmlEventos(eventos) {
  const lista = Array.isArray(eventos) ? eventos.filter(e => e && typeof e === "object") : [];
  if (!lista.length) return "<p class='psc-legenda'>Nada registrado ainda.</p>";
  return `<ol class="cpa-historico">${lista.map(e => {
    const partes = [];
    if (e.formaRotulo) partes.push(escaparHtmlEbd(e.formaRotulo));
    if (e.conseguiu === true) partes.push("conseguiu falar");
    if (e.conseguiu === false) partes.push("não conseguiu falar");
    if (e.acompanhante) partes.push(`foi junto: ${escaparHtmlEbd(e.acompanhante)}`);
    if (e.responsavelNome) partes.push(`responsável: ${escaparHtmlEbd(e.responsavelNome)}`);
    if (e.nivelParaRotulo) partes.push(`subiu para: ${escaparHtmlEbd(e.nivelParaRotulo)}`);
    if (e.prazoNovo) partes.push(`prazo: ${cpaDataHora(e.prazoNovo)}`);
    return `<li class="cpa-evento"><strong>${escaparHtmlEbd(cpaRotuloEvento(e.tipo))}</strong> — ${cpaDataHora(e.em)}${e.por ? `, por ${escaparHtmlEbd(e.por)}` : ""}
      ${partes.length ? `<br /><span class="cpa-evento-det">${partes.join(" · ")}</span>` : ""}
      ${e.observacao ? `<p class="cpa-texto">${escaparHtmlEbd(e.observacao)}</p>` : ""}</li>`;
  }).join("")}</ol>`;
}
function cpaHtmlBotoesDetalhe(d) {
  if (!d.item || d.item.status !== "ABERTO") return "";
  return `<button type="button" class="btn-confirmar cpa-btn" data-on-click="cpaAbrirFormAcao" data-args-click="${argsAttr("contato", ARG.elemento)}">📞 Registrar contato</button>
    <button type="button" class="btn-confirmar cpa-btn" data-on-click="cpaAbrirFormAcao" data-args-click="${argsAttr("concluir", ARG.elemento)}">✅ Concluir</button>
    ${d.podeGerir ? `<button type="button" class="btn-confirmar btn-secundario cpa-btn" data-on-click="cpaAbrirFormAcao" data-args-click="${argsAttr("responsavel", ARG.elemento)}">👤 Trocar responsável</button>
    <button type="button" class="btn-confirmar btn-secundario cpa-btn" data-on-click="cpaAbrirFormAcao" data-args-click="${argsAttr("adiar", ARG.elemento)}">📅 Adiar prazo</button>
    <button type="button" class="btn-confirmar btn-secundario cpa-btn" data-on-click="cpaAbrirFormAcao" data-args-click="${argsAttr("cancelar", ARG.elemento)}">✖️ Cancelar</button>` : ""}`;
}
function cpaRenderDetalhe() {
  if (!cpaDet) return;
  const d = cpaDet.dados, i = d.item;
  const ids = cpaIdsDoCtx(cpaDet.ctx);
  const conteudo = cpaEl(ids.conteudo);
  if (!conteudo) return;
  const aberto = i.status === "ABERTO";
  conteudo.innerHTML = `<div class="cpa-detalhe">
    <h4 id="cpaDetTitulo" tabindex="-1">${escaparHtmlEbd(i.pessoaNome || "(sem nome)")} — ${escaparHtmlEbd(i.tipoRotulo)}</h4>
    <div class="cpa-selos">${cpaSelosDoItem(i)}</div>
    ${i.menor ? "<p class='cnl-aviso-senha cpa-aviso-menor' role='note'>🧒 <strong>Menor de idade.</strong> Fale com os pais ou responsáveis. Nunca procure a criança ou o adolescente sozinho(a).</p>" : ""}
    <dl class="cpa-dados">
      ${cpaCampo("Congregação", escaparHtmlEbd(i.congregacaoNome))}
      ${cpaCampo("Contato", aberto ? cpaHtmlContato(i.contato) : "")}
      ${cpaCampo("Motivo", i.motivo ? escaparHtmlEbd(i.motivo) : "")}
      ${cpaCampo("Responsável", cpaHtmlResponsavel(i))}
      ${cpaCampo("Prazo", aberto ? `${cpaHtmlPrazo(i)} ${i.prazoEm ? `(${cpaDataHora(i.prazoEm)})` : ""}` : "")}
      ${cpaCampo("Quem está chamado", aberto ? escaparHtmlEbd(i.nivelRotulo) : "")}
      ${cpaCampo("Origem", escaparHtmlEbd(i.origemRotulo))}
      ${cpaCampo("Por que o sistema detectou", i.deteccaoResumo ? escaparHtmlEbd(i.deteccaoResumo) : "")}
      ${cpaCampo("Aberto em", cpaDataHora(i.criadoEm))}
      ${cpaCampo("Primeiro contato", i.primeiroContatoEm ? cpaDataHora(i.primeiroContatoEm) : "")}
      ${cpaCampo("Encerrado", !aberto ? `${cpaDataHora(i.encerradoEm)} — ${escaparHtmlEbd(i.desfechoRotulo || cpaRotuloStatus(i.status))}` : "")}
    </dl>
    ${i.origem === "DETECCAO" ? "<p class='psc-legenda'>A detecção compara a frequência da própria pessoa na EBD e nas reuniões (o sistema não registra presença nos cultos). É só um sinal: converse antes de concluir qualquer coisa.</p>" : ""}
    ${i.sugestaoAbandono ? "<p class='cnl-aviso-senha' role='note'>Se a pessoa não voltar, o caminho é o procedimento de abandono (Disciplina → Perda de Membresia), que a liderança abre à mão: a fila não abre sozinha.</p>" : ""}
    <div class="psc-acoes cpa-acoes-detalhe">${cpaHtmlBotoesDetalhe(d)}</div>
    <div id="cpaFormAcao"></div>
    <h5>Histórico</h5>
    ${cpaHtmlEventos(d.eventos)}
    <div id="cpaNotasCx" class="cpa-notas"></div>
  </div>`;
  cpaRenderNotas();
}

// -- os formulários do acompanhamento --
function cpaFormValido(bruto) { return CPA_FORMS.includes(bruto) ? bruto : ""; }
function cpaHtmlRodapeForm(acao, rotulo) {
  return `<div class="psc-acoes">
      <button type="button" class="btn-confirmar cpa-btn" id="cpaFormBotao" data-on-click="${acao}" data-args-click="${argsAttr(ARG.elemento)}">${rotulo}</button>
      <button type="button" class="btn-confirmar btn-secundario cpa-btn" data-on-click="cpaFecharFormAcao">Fechar</button>
    </div>
    <p id="cpaFormMsg" class="subtitle" role="status" aria-live="polite"></p>`;
}
function cpaFormContato() {
  const c = cpaCatalogos;
  const hoje = cpaHojeDe(cpaDet.dados.agora);
  const min = calSomarDias(hoje, -cpaLimite("contatoRetroativoDias"));
  return `<div class="cal-form cpa-form" role="group" aria-labelledby="cpaFormTitulo">
    <h5 id="cpaFormTitulo">📞 Registrar contato</h5>
    <div class="cal-form-grade">
      <div class="input-group">
        <label for="cpaFcForma">Como foi o contato</label>
        <select id="cpaFcForma" data-on-change="cpaMudouFormaAcao">${cpaOpcoes(c.formas, x => x.codigo, x => x.rotulo, "Escolha")}</select>
      </div>
      <div class="input-group">
        <label for="cpaFcData">Dia do contato (vazio = hoje)</label>
        <input type="date" id="cpaFcData" min="${escaparHtmlEbd(min)}" max="${escaparHtmlEbd(hoje)}" />
      </div>
    </div>
    <fieldset class="cpa-grupo">
      <legend>Conseguiu falar com a pessoa?</legend>
      <label class="cpa-opcao"><input type="radio" name="cpaFcConseguiu" id="cpaFcSim" value="sim" /> Sim, conseguiu</label>
      <label class="cpa-opcao"><input type="radio" name="cpaFcConseguiu" id="cpaFcNao" value="nao" /> Não conseguiu (não atendeu, não estava)</label>
    </fieldset>
    <p id="cpaFcRegra" class="cnl-aviso-senha" role="note" style="display:none;"><strong>Visita nunca a sós</strong> (Regimento Art. 85 §3º): toda visita no lar ou no hospital é feita com outra pessoa, e o nome dela fica registrado.</p>
    <div class="input-group">
      <label for="cpaFcAcompanhante">Quem foi junto <span id="cpaFcObrig">(obrigatório em visita)</span></label>
      <input type="text" id="cpaFcAcompanhante" maxlength="${cpaLimite("nome")}" autocomplete="off" />
    </div>
    <div class="input-group">
      <label for="cpaFcObs">Observação curta (opcional, até ${cpaLimite("observacao")} caracteres)</label>
      <textarea id="cpaFcObs" rows="3" maxlength="${cpaLimite("observacao")}" autocomplete="off"></textarea>
      <p class="psc-legenda">Não escreva diagnóstico, doença nem segredo aqui: o histórico é visto por quem trabalha no acompanhamento. Para isso use as notas pastorais, mais abaixo.</p>
    </div>
    ${cpaHtmlRodapeForm("cpaEnviarContatoAcao", "💾 Gravar o contato")}
  </div>`;
}
function cpaFormConcluir() {
  const i = cpaDet.dados.item;
  return `<div class="cal-form cpa-form" role="group" aria-labelledby="cpaFormTitulo">
    <h5 id="cpaFormTitulo">✅ Concluir o acompanhamento</h5>
    <div class="input-group">
      <label for="cpaFkDesfecho">Como terminou</label>
      <select id="cpaFkDesfecho">${cpaOpcoes(cpaCatalogos.desfechosConclusao, x => x.codigo, x => x.rotulo, "Escolha")}</select>
    </div>
    ${i.tipo === "AFASTAMENTO" ? "<p class='psc-legenda'>Se a pessoa não foi localizada ou não quis contato, o caminho do abandono continua manual (a liderança decide).</p>" : ""}
    <div class="input-group">
      <label for="cpaFkObs">Observação (obrigatória quando o desfecho é "Outro"; até ${cpaLimite("observacao")} caracteres)</label>
      <textarea id="cpaFkObs" rows="3" maxlength="${cpaLimite("observacao")}" autocomplete="off"></textarea>
    </div>
    ${cpaHtmlRodapeForm("cpaEnviarConcluirAcao", "✅ Concluir")}
  </div>`;
}
function cpaFormResponsavel() {
  const i = cpaDet.dados.item;
  return `<div class="cal-form cpa-form" role="group" aria-labelledby="cpaFormTitulo">
    <h5 id="cpaFormTitulo">👤 Trocar responsável</h5>
    <p class="psc-legenda">Responsável hoje: ${cpaHtmlResponsavel(i)}. Pode ser qualquer membro ativo e maior de idade da congregação ou alguém da liderança que alcança a congregação. Quem for nomeado recebe o aviso.</p>
    <div class="input-group">
      <label for="cpaFrBusca">Nome de quem vai acompanhar (pelo menos 2 letras)</label>
      <input type="text" id="cpaFrBusca" maxlength="60" autocomplete="off" />
    </div>
    <div class="psc-acoes">
      <button type="button" class="btn-confirmar btn-secundario cpa-btn" data-on-click="cpaBuscarAcao" data-args-click="${argsAttr("troca", ARG.elemento)}">🔍 Buscar</button>
      <button type="button" class="btn-confirmar btn-secundario cpa-btn" data-on-click="cpaFecharFormAcao">Fechar</button>
    </div>
    <div id="cpaFrRes" role="status" aria-live="polite"></div>
    <p id="cpaFormMsg" class="subtitle" role="status" aria-live="polite"></p>
  </div>`;
}
function cpaFormAdiar() {
  const hoje = cpaHojeDe(cpaDet.dados.agora);
  const max = calSomarDias(hoje, cpaLimite("adiarDias"));
  return `<div class="cal-form cpa-form" role="group" aria-labelledby="cpaFormTitulo">
    <h5 id="cpaFormTitulo">📅 Adiar o prazo</h5>
    <p class="psc-legenda">Até ${cpaLimite("adiarDias")} dias à frente, com o motivo. Fica no histórico.</p>
    <div class="cal-form-grade">
      <div class="input-group">
        <label for="cpaFaData">Novo prazo (vale até o fim do dia)</label>
        <input type="date" id="cpaFaData" min="${escaparHtmlEbd(hoje)}" max="${escaparHtmlEbd(max)}" />
      </div>
    </div>
    <div class="input-group">
      <label for="cpaFaMotivo">Motivo (de 5 a ${cpaLimite("observacao")} caracteres)</label>
      <textarea id="cpaFaMotivo" rows="2" maxlength="${cpaLimite("observacao")}" autocomplete="off"></textarea>
    </div>
    ${cpaHtmlRodapeForm("cpaEnviarAdiarAcao", "📅 Adiar")}
  </div>`;
}
function cpaFormCancelar() {
  return `<div class="cal-form cpa-form" role="group" aria-labelledby="cpaFormTitulo">
    <h5 id="cpaFormTitulo">✖️ Cancelar o acompanhamento</h5>
    <p class="psc-legenda">Só para o que foi aberto por engano ou em duplicidade. Se a pessoa foi procurada, use "Concluir".</p>
    <div class="input-group">
      <label for="cpaFxDesfecho">Por que cancelar</label>
      <select id="cpaFxDesfecho">${cpaOpcoes(cpaCatalogos.desfechosCancelamento, x => x.codigo, x => x.rotulo, "Escolha")}</select>
    </div>
    <div class="input-group">
      <label for="cpaFxMotivo">Explique (de 5 a ${cpaLimite("observacao")} caracteres)</label>
      <textarea id="cpaFxMotivo" rows="2" maxlength="${cpaLimite("observacao")}" autocomplete="off"></textarea>
    </div>
    ${cpaHtmlRodapeForm("cpaEnviarCancelarAcao", "✖️ Cancelar o acompanhamento")}
  </div>`;
}
async function cpaAbrirFormAcao(tipoBruto, gatilho) {
  const tipo = cpaFormValido(tipoBruto);
  const area = cpaEl(tipo === "nota" ? "cpaNotaForm" : "cpaFormAcao");
  if (!tipo || !area || !cpaDet) return;
  if (!cpaCatalogos) {
    const id = cpaDet.itemId, geracao = cpaGeracao;
    await cpaGarantirCatalogos();
    if (geracao !== cpaGeracao || !cpaDet || id !== cpaDet.itemId) return;   // a pessoa trocou de acompanhamento ou de login enquanto o catálogo vinha
    if (!cpaCatalogos) { cpaEscrever(cpaIdsDoCtx(cpaDet.ctx).msg, CPA_MSG_SEM_CATALOGO, true); return; }
  }
  const gerir = !!cpaDet.dados.podeGerir;
  if (["responsavel", "adiar", "cancelar"].includes(tipo) && !gerir) return;
  cpaFecharFormInterno();
  cpaGatilhoForm = gatilho && typeof gatilho === "object" ? gatilho : null;
  area.innerHTML = tipo === "contato" ? cpaFormContato() : tipo === "concluir" ? cpaFormConcluir() : tipo === "responsavel" ? cpaFormResponsavel() : tipo === "adiar" ? cpaFormAdiar()
    : tipo === "cancelar" ? cpaFormCancelar() : cpaFormNota();
  cpaRolarPara(tipo === "nota" ? "cpaNotaForm" : "cpaFormAcao");
  cpaFocarId(CPA_PRIMEIRO_CAMPO[tipo]);
}
function cpaFecharFormInterno() {
  cpaEsvaziar(["cpaFormAcao", "cpaNotaForm"]);
  cpaBuscaRes.troca = [];
}
function cpaFecharFormAcao() {
  cpaFecharFormInterno();
  const gatilho = cpaGatilhoForm;
  cpaGatilhoForm = null;
  if (gatilho && gatilho.isConnected) cpaFocar(gatilho);
}
function cpaMudouFormaAcao() {
  const presencial = !!cpaCatalogos && cpaCatalogos.formasPresenciais.includes(cpaTexto("cpaFcForma"));
  cpaMostrar("cpaFcRegra", presencial);
}
// Depois de um ato que deu certo (ou de um 409, "mudou enquanto isso"): o acompanhamento e a lista são relidos e a mensagem do servidor volta para o lugar dela.
async function cpaDepoisDoAto(data, destaque) {
  if (!cpaDet) return;
  const { ctx, itemId } = cpaDet;
  const ok = await cpaCarregarDetalhe(ctx, itemId, false);
  if (ok) cpaEscrever(cpaIdsDoCtx(ctx).msg, cpaMsgErro(data), !!destaque || data.sucesso === false);
  else if (data.sucesso !== false && !(cpaDet && cpaDet.ctx === ctx)) {
    // o ato deu certo, mas o acompanhamento não se abre mais para esta pessoa (o voluntário que concluiu: o servidor só abre item aberto): volta à lista com a mensagem do ato
    cpaFecharDetalheInterno(ctx);
    if (ctx === "Meu") cpaRenderMeus();
    cpaEscrever(ctx === "Meu" ? "cpaMeuMsg" : "cpaFilaMsg", cpaMsgErro(data), !!destaque);
    cpaFocarId(ctx === "Meu" ? "cpaMeusTitulo" : "cpaFilaTitulo");
  }
  if (ctx === "Ges") cpaCarregarFilaAcao(); else cpaRecarregarMeus();
}
// a resposta de um ato no acompanhamento: sucesso relê; 409 relê e mostra o porquê; 404 (o item sumiu ou não é mais seu) fecha; o resto fica no formulário
async function cpaTratarAto(data, idMsgForm, geracao, itemId, destaqueOk) {
  if (geracao !== cpaGeracao || !cpaDet || cpaDet.itemId !== itemId) return;
  if (data.sucesso !== false) { if (!data.jaAvisado) mostrarToast(cpaMsgErro(data), "sucesso"); await cpaDepoisDoAto(data, destaqueOk); return; }
  if (data.httpStatus === 409) { if (!data.jaAvisado) mostrarToast(cpaMsgErro(data), "erro"); await cpaDepoisDoAto(data, true); return; }
  if (data.httpStatus === 404) {
    const ctx = cpaDet.ctx;
    cpaFecharDetalheInterno(ctx);
    cpaMostrar(cpaIdsDoCtx(ctx).lista, true);
    cpaEscrever(ctx === "Meu" ? "cpaMeuMsg" : "cpaFilaMsg", CPA_MSG_NAO_ABRIU, true);
    if (ctx === "Ges") cpaCarregarFilaAcao(); else cpaRecarregarMeus();
    return;
  }
  cpaMostrarResultado(data, idMsgForm, true);
}
async function cpaEnviarContatoAcao(botao) {
  if (!cpaDet || !cpaCatalogos) return;
  const forma = cpaTexto("cpaFcForma");
  const conseguiu = cpaEscolhaSimNao("cpaFcSim", "cpaFcNao");
  const acompanhante = cpaTexto("cpaFcAcompanhante");
  const observacao = cpaTexto("cpaFcObs");
  const data = cpaTexto("cpaFcData");
  let problema = "";
  if (!cpaCatalogos.formas.some(f => f.codigo === forma)) problema = "Escolha como foi o contato.";
  else if (conseguiu == null) problema = "Diga se conseguiu falar com a pessoa.";
  else if (cpaCatalogos.formasPresenciais.includes(forma) && !acompanhante) problema = "Visita é sempre com outra pessoa (Regimento Art. 85 §3º: nunca a sós). Informe quem foi junto.";
  else problema = cpaProblemaTexto(acompanhante, { nome: "o nome de quem foi junto", min: 2, max: cpaLimite("nome") }) || cpaProblemaTexto(observacao, { nome: "a observação", max: cpaLimite("observacao") });
  if (problema) { cpaEscrever("cpaFormMsg", problema, true); if (forma && cpaCatalogos.formasPresenciais.includes(forma)) cpaMostrar("cpaFcRegra", true); return; }
  const corpo = { itemId: cpaDet.itemId, forma, conseguiu };
  if (acompanhante) corpo.acompanhante = acompanhante;
  if (observacao) corpo.observacao = observacao;
  if (data) corpo.data = data;
  const geracao = cpaGeracao, itemId = cpaDet.itemId;
  await cpaProteger(botao, async () => {
    cpaEscrever("cpaFormMsg", "Gravando…", false);
    const r = await cpaPostar("contato", corpo);
    await cpaTratarAto(r, "cpaFormMsg", geracao, itemId, false);
  }, `contato${itemId}`);
}
async function cpaEnviarConcluirAcao(botao) {
  if (!cpaDet || !cpaCatalogos) return;
  const desfecho = cpaTexto("cpaFkDesfecho");
  const observacao = cpaTexto("cpaFkObs");
  let problema = "";
  if (!cpaCatalogos.desfechosConclusao.some(x => x.codigo === desfecho)) problema = "Escolha como terminou o acompanhamento.";
  else if (desfecho === "OUTRO" && !observacao) problema = "Com o desfecho \"Outro\", escreva uma observação curta.";
  else problema = cpaProblemaTexto(observacao, { nome: "a observação", max: cpaLimite("observacao") });
  if (problema) { cpaEscrever("cpaFormMsg", problema, true); return; }
  const corpo = { itemId: cpaDet.itemId, desfecho };
  if (observacao) corpo.observacao = observacao;
  const geracao = cpaGeracao, itemId = cpaDet.itemId;
  await cpaProteger(botao, async () => {
    cpaEscrever("cpaFormMsg", "Gravando…", false);
    const r = await cpaPostar("concluir", corpo);
    // sugestaoAbandono: a mensagem do servidor mostra o caminho manual do abandono (em destaque)
    await cpaTratarAto(r, "cpaFormMsg", geracao, itemId, r.sucesso !== false && r.sugestaoAbandono === true);
  }, `concluir${itemId}`);
}
async function cpaEnviarTrocaAcao(responsavelMembroId, botao) {
  if (!cpaDet || !cpaDet.dados.podeGerir) return;
  const p = (cpaBuscaRes.troca || []).find(x => Number(x.membroId) === Number(responsavelMembroId));
  if (!p) return;
  if (!(await confirmarAcao(`Nomear ${String(p.nome == null ? "" : p.nome)} como responsável por este acompanhamento? A pessoa recebe o aviso.`, "Nomear"))) return;
  const geracao = cpaGeracao, itemId = cpaDet.itemId;
  await cpaProteger(botao, async () => {
    cpaEscrever("cpaFormMsg", "Gravando…", false);
    const r = await cpaPostar("atribuir", { itemId, responsavelMembroId: Number(p.membroId) });
    await cpaTratarAto(r, "cpaFormMsg", geracao, itemId, false);
  }, `atribuir${itemId}`);
}
async function cpaEnviarAdiarAcao(botao) {
  if (!cpaDet || !cpaDet.dados.podeGerir) return;
  const novoPrazo = cpaTexto("cpaFaData");
  const motivo = cpaTexto("cpaFaMotivo");
  const problema = !/^\d{4}-\d{2}-\d{2}$/.test(novoPrazo) ? "Escolha a nova data do prazo." : cpaProblemaTexto(motivo, { nome: "o motivo", min: 5, max: cpaLimite("observacao"), obrigatorio: true });
  if (problema) { cpaEscrever("cpaFormMsg", problema, true); return; }
  const geracao = cpaGeracao, itemId = cpaDet.itemId;
  await cpaProteger(botao, async () => {
    cpaEscrever("cpaFormMsg", "Gravando…", false);
    const r = await cpaPostar("adiar", { itemId, novoPrazo, motivo });
    await cpaTratarAto(r, "cpaFormMsg", geracao, itemId, false);
  }, `adiar${itemId}`);
}
async function cpaEnviarCancelarAcao(botao) {
  if (!cpaDet || !cpaDet.dados.podeGerir || !cpaCatalogos) return;
  const desfecho = cpaTexto("cpaFxDesfecho");
  const motivo = cpaTexto("cpaFxMotivo");
  const problema = !cpaCatalogos.desfechosCancelamento.some(x => x.codigo === desfecho) ? "Escolha por que cancelar (duplicado ou engano)." : cpaProblemaTexto(motivo, { nome: "o motivo", min: 5, max: cpaLimite("observacao"), obrigatorio: true });
  if (problema) { cpaEscrever("cpaFormMsg", problema, true); return; }
  if (!(await confirmarAcao("Cancelar este acompanhamento? Ele sai da fila (o histórico fica guardado). Use só para o que foi aberto por engano ou em duplicidade.", "Cancelar o acompanhamento"))) return;
  const geracao = cpaGeracao, itemId = cpaDet.itemId;
  await cpaProteger(botao, async () => {
    cpaEscrever("cpaFormMsg", "Gravando…", false);
    const r = await cpaPostar("cancelar", { itemId, desfecho, motivo });
    await cpaTratarAto(r, "cpaFormMsg", geracao, itemId, false);
  }, `cancelar${itemId}`);
}

// ============================================================================
// 3) AS NOTAS PASTORAIS (dentro do acompanhamento: liderança e responsável)
// ============================================================================
// A nota é sobre o membro (item de membro: a liderança vê o membroId) ou, para quem não é do cadastro, sobre o item.
function cpaAlvoNota() {
  if (!cpaDet) return null;
  const i = cpaDet.dados.item;
  return cpaInteiro(i.membroId) ? { membroId: cpaInteiro(i.membroId) } : { itemId: cpaDet.itemId };
}
function cpaNiveisPermitidos() {
  const pode = cpaDet && Array.isArray(cpaDet.dados.podeNotaNiveis) ? cpaDet.dados.podeNotaNiveis.map(x => String(x)) : [];
  return (cpaCatalogos ? cpaCatalogos.niveisNota : []).filter(n => pode.includes(n.codigo));
}
function cpaDescricaoNota(n) { return `${n.autor ? `de ${n.autor}` : "de alguém"}${n.minha ? " (você)" : ""}, em ${calDataHora(n.criadaEm)}`; }
function cpaHtmlNota(n) {
  const id = Number(n.notaId);
  const pastoral = n.nivel === "PASTORAL";
  const corrige = n.retificaNotaId ? cpaNotas.find(x => Number(x.notaId) === Number(n.retificaNotaId)) : null;
  const verLeituras = n.minha === true || cpaEhGeral();
  return `<li class="cpa-nota">
    <div class="cpa-selos">${cpaSelo(pastoral ? "cal-st-indeferido" : n.nivel === "LIDERANCA" ? "cal-st-proposto" : "cal-st-deferido", `${pastoral ? "🔒 " : ""}${n.nivelRotulo || n.nivel}`)}${n.minha ? cpaSelo("cal-st-cancelado", "minha") : ""}</div>
    <p class="cpa-linha">Nota ${escaparHtmlEbd(cpaDescricaoNota(n))} · ${Number(n.tamanho) || 0} caracteres${n.retificaNotaId ? ` · corrige ${corrige ? `a nota ${escaparHtmlEbd(cpaDescricaoNota(corrige))}` : "uma nota anterior"}` : ""}</p>
    ${pastoral ? `<p class="psc-legenda">Somente pastor.${n.pedeConfirmacao ? " Abrir pede a confirmação reforçada (chave de acesso ou código por e-mail)." : ""}</p>` : ""}
    <div class="psc-acoes">
      <button type="button" class="btn-confirmar btn-secundario cpa-btn" data-on-click="cpaAbrirNotaAcao" data-args-click="${argsAttr(id, ARG.elemento)}">📖 Abrir a nota</button>
      ${verLeituras ? `<button type="button" class="btn-confirmar btn-secundario cpa-btn" id="cpaLeitBtn${id}" data-on-click="cpaLeiturasAcao" data-args-click="${argsAttr(id, ARG.elemento)}">👁️ Quem abriu</button>` : ""}
    </div>
    <div id="cpaLeit${id}" class="cpa-leituras" role="status" aria-live="polite"></div>
  </li>`;
}
function cpaRenderNotas() {
  const cx = cpaEl("cpaNotasCx");
  if (!cx || !cpaDet) return;
  const podeEscrever = cpaNiveisPermitidos().length > 0 || (cpaDet.dados.podeNotaNiveis || []).length > 0;
  cx.innerHTML = `<h5 id="cpaNotasTitulo" tabindex="-1">🔐 Notas pastorais</h5>
    <p class="psc-legenda">A lista mostra só as notas que você pode ler, sem o texto. O texto só aparece ao tocar em "Abrir a nota", e <strong>cada abertura fica registrada</strong> (quem abriu e quando). A pessoa acompanhada nunca vê as notas.</p>
    ${cpaNotas.length ? `<ul class="cpa-notas-lista">${cpaNotas.map(cpaHtmlNota).join("")}</ul>` : "<p class='psc-legenda'>Nenhuma nota que você possa ler.</p>"}
    <p id="cpaNotasMsg" class="subtitle" role="status" aria-live="polite"></p>
    <div id="cpaNotaCx" class="cpa-nota-aberta" style="display:none;" tabindex="-1" role="region" aria-labelledby="cpaNotaAbertaTitulo">
      <h5 id="cpaNotaAbertaTitulo">Nota aberta</h5>
      <div id="cpaNotaCorpo"></div>
      <div class="psc-acoes"><button type="button" class="btn-confirmar btn-secundario cpa-btn" id="cpaNotaFechar" data-on-click="cpaFecharNotaAcao">Fechar a nota</button></div>
    </div>
    <div class="psc-acoes">
      ${podeEscrever ? `<button type="button" class="btn-confirmar btn-secundario cpa-btn" data-on-click="cpaAbrirFormAcao" data-args-click="${argsAttr("nota", ARG.elemento)}">✍️ Escrever nota</button>` : ""}
      <button type="button" class="btn-confirmar btn-secundario cpa-btn" data-on-click="cpaRecarregarNotasAcao">🔄 Atualizar notas</button>
    </div>
    <div id="cpaNotaForm"></div>`;
}
// Relê as notas: GET notas pelo alvo; se o alvo não é alcançável por esse caminho (o responsável não vê a matrícula de quem acompanha), relê o acompanhamento, que traz a lista.
async function cpaRecarregarNotasAcao() {
  if (!cpaDet) return;
  const alvo = cpaAlvoNota();
  const { ctx, itemId } = cpaDet;
  const seq = ++cpaSeqNotas;
  cpaLimparNota();
  const data = await cpaObter(alvo.membroId ? `notas?membroId=${alvo.membroId}` : `notas?itemId=${alvo.itemId}`);
  if (seq !== cpaSeqNotas || !cpaDet || cpaDet.itemId !== itemId) return;
  if (data.sucesso === false || !Array.isArray(data.notas)) {
    if (data.httpStatus === 404) { await cpaCarregarDetalhe(ctx, itemId, false); return; }
    cpaMostrarResultado(data, "cpaNotasMsg", true);
    return;
  }
  cpaNotas = data.notas.filter(n => n && typeof n === "object" && cpaInteiro(n.notaId));
  cpaRenderNotas();
}
function cpaMostrarNota(nota) {
  const corpo = cpaEl("cpaNotaCorpo"), cx = cpaEl("cpaNotaCx");
  if (!corpo || !cx) return;
  corpo.textContent = "";
  const linha = (tag, classe, texto) => {
    const el = document.createElement(tag);
    if (classe) el.className = classe;
    el.textContent = texto;   // textContent, nunca innerHTML: a nota é aconselhamento e nenhuma marcação pode ser executada
    corpo.appendChild(el);
  };
  linha("p", "cpa-nota-cab", `${nota.nivelRotulo || nota.nivel || ""}${nota.nivel === "PASTORAL" ? " — somente pastor" : ""} · ${nota.autor || ""}${nota.minha ? " (você)" : ""} · ${calDataHora(nota.criadaEm)}`);
  linha("p", "cpa-nota-texto", String(nota.texto == null ? "" : nota.texto));
  linha("p", "psc-legenda", "Esta abertura ficou registrada (quem abriu e quando). Não copie nem repasse: o que está aqui é sigiloso.");
  cx.style.display = "block";
  cpaFocar(cx);
}
async function cpaAbrirNotaAcao(notaId, botao) {
  const id = cpaInteiro(notaId);
  if (!id || !cpaDet) return;
  if (!cpaNotas.some(n => Number(n.notaId) === id)) return;
  cpaLimparNota();
  const seq = cpaSeqNota, itemId = cpaDet.itemId;
  cpaEscrever("cpaNotasMsg", "Abrindo…", false);
  await cpaProteger(botao, async () => {
    const data = await cpaPostar("abrir-nota", { notaId: id });   // "somente pastor": 428 → confirmação reforçada e a chamada é repetida uma vez
    if (seq !== cpaSeqNota || !cpaDet || cpaDet.itemId !== itemId) return;   // a pessoa fechou, trocou de acompanhamento, saiu da aba ou trocou de login: o texto NÃO entra na tela
    if (data.sucesso === false || !data.nota || typeof data.nota !== "object") {
      cpaMostrarResultado(data, "cpaNotasMsg", true);
      if (data.httpStatus === 404) cpaEscrever("cpaNotasMsg", "Esta nota não pode mais ser aberta por você (ela pode ter sido apagada ou a pessoa saiu do seu alcance).", true);
      return;
    }
    cpaEscrever("cpaNotasMsg", "", false);
    cpaMostrarNota(data.nota);
  }, `nota${id}`);
}
function cpaFecharNotaAcao() {
  const nota = cpaEl("cpaNotaCx");
  cpaLimparNota();
  if (nota) cpaFocarId("cpaNotasTitulo");
}
async function cpaLeiturasAcao(notaId, botao) {
  const id = cpaInteiro(notaId);
  if (!id || !cpaDet) return;
  const cx = cpaEl(`cpaLeit${id}`);
  if (!cx) return;
  const seq = ++cpaSeqLeit, itemId = cpaDet.itemId;
  cx.textContent = "Carregando…";
  await cpaProteger(botao, async () => {
    const data = await cpaObter(`leituras?notaId=${id}`);
    if (seq !== cpaSeqLeit || !cpaDet || cpaDet.itemId !== itemId || !cpaEl(`cpaLeit${id}`)) return;
    if (data.sucesso === false || !Array.isArray(data.leituras)) {
      if (data.httpStatus === 404) {
        const b = cpaEl(`cpaLeitBtn${id}`);
        if (b) b.style.display = "none";
        cx.textContent = "Só quem escreveu a nota e o nível geral veem quem abriu.";
        return;
      }
      cx.textContent = cpaMsgErro(data);
      return;
    }
    const lista = data.leituras.filter(l => l && typeof l === "object");
    cx.innerHTML = lista.length ? `<p class="psc-legenda">Quem abriu (as 30 últimas):</p><ul class="cpa-lista">${lista.map(l => `<li>${escaparHtmlEbd(l.nome)} — ${cpaDataHora(l.lidaEm)}</li>`).join("")}</ul>`
      : "<p class='psc-legenda'>Ninguém abriu esta nota ainda.</p>";
  }, `leit${id}`);
}
function cpaFormNota() {
  const niveis = cpaNiveisPermitidos();
  const corrigiveis = cpaNotas;
  return `<div class="cal-form cpa-form" role="group" aria-labelledby="cpaFnTitulo">
    <h5 id="cpaFnTitulo">✍️ Escrever nota pastoral</h5>
    <div class="input-group">
      <label for="cpaFnNivel">Quem pode ler</label>
      <select id="cpaFnNivel">${cpaOpcoes(niveis, x => x.codigo, x => x.rotulo, "Escolha")}</select>
    </div>
    <ul class="cpa-lista cpa-niveis">${niveis.map(n => `<li><strong>${escaparHtmlEbd(n.rotulo)}:</strong> ${escaparHtmlEbd(n.descricao || "")}</li>`).join("")}</ul>
    <div class="input-group">
      <label for="cpaFnTexto">A nota (de 3 a ${cpaLimite("nota")} caracteres)</label>
      <textarea id="cpaFnTexto" rows="5" maxlength="${cpaLimite("nota")}" autocomplete="off" spellcheck="false" data-on-input="cpaContarNotaAcao"></textarea>
      <p class="psc-legenda"><span id="cpaFnContador">0</span>/${cpaLimite("nota")} caracteres.</p>
    </div>
    <div class="input-group">
      <label for="cpaFnCorrige">Esta nota corrige outra? (opcional)</label>
      <select id="cpaFnCorrige">${cpaOpcoes(corrigiveis, x => String(Number(x.notaId)), x => `Corrige a nota ${cpaDescricaoNota(x)} (${x.nivelRotulo || x.nivel})`, "Não corrige nenhuma")}</select>
    </div>
    <p class="cnl-aviso-senha" role="note">A nota <strong>não se edita</strong> depois de guardada. Para corrigir, escreva outra nota e escolha acima qual ela corrige.</p>
    <div class="psc-acoes">
      <button type="button" class="btn-confirmar cpa-btn" id="cpaFnBotao" data-on-click="cpaEnviarNotaAcao" data-args-click="${argsAttr(ARG.elemento)}">💾 Guardar a nota</button>
      <button type="button" class="btn-confirmar btn-secundario cpa-btn" data-on-click="cpaFecharFormAcao">Fechar</button>
    </div>
    <p id="cpaFnMsg" class="subtitle" role="status" aria-live="polite"></p>
  </div>`;
}
function cpaContarNotaAcao() { const c = cpaEl("cpaFnContador"); if (c) c.textContent = String(cpaTexto("cpaFnTexto").length); }
async function cpaEnviarNotaAcao(botao) {
  if (!cpaDet) return;
  const nivel = cpaTexto("cpaFnNivel");
  const texto = cpaTexto("cpaFnTexto");
  const retifica = cpaInteiro(cpaTexto("cpaFnCorrige"));
  const problema = !cpaNiveisPermitidos().some(n => n.codigo === nivel) ? "Escolha quem pode ler a nota." : cpaProblemaTexto(texto, { nome: "a nota", min: 3, max: cpaLimite("nota"), obrigatorio: true });
  if (problema) { cpaEscrever("cpaFnMsg", problema, true); return; }
  const corpo = Object.assign({}, cpaAlvoNota(), { nivel, texto });
  if (retifica) corpo.retificaNotaId = retifica;
  const geracao = cpaGeracao, itemId = cpaDet.itemId;
  await cpaProteger(botao, async () => {
    cpaEscrever("cpaFnMsg", "Guardando…", false);
    const data = await cpaPostar("nota", corpo);
    if (geracao !== cpaGeracao || !cpaDet || cpaDet.itemId !== itemId) return;
    if (data.sucesso === false) {
      cpaMostrarResultado(data, "cpaFnMsg", true);
      if (data.httpStatus === 404) cpaEscrever("cpaFnMsg", "Não foi possível guardar a nota neste acompanhamento (ele pode ter sido encerrado ou não estar mais com você). Nada foi guardado.", true);
      return;
    }
    const msg = cpaMsgErro(data);
    cpaGatilhoForm = null;
    await cpaRecarregarNotasAcao();   // o formulário some junto (a lista é refeita); o texto não fica na tela
    if (geracao !== cpaGeracao || !cpaDet || cpaDet.itemId !== itemId) return;
    if (!data.jaAvisado) mostrarToast(msg, "sucesso");
    cpaEscrever("cpaNotasMsg", msg, false);
    cpaFocarId("cpaNotasTitulo");
  }, `nota-nova${itemId}`);
}

// ============================================================================
// b) PEDIDOS DE ORAÇÃO (liderança: moderação e sinal de risco)
// ============================================================================
function cpaAplicarPilulasPedidos() {
  CPA_SITUACOES_PEDIDOS.forEach(s => {
    const b = cpaEl(`btnCpaPed${s[0]}${s.slice(1).toLowerCase()}`);
    if (b) { b.classList.toggle("ativo", s === cpaSituacaoPedidos); b.setAttribute("aria-pressed", s === cpaSituacaoPedidos ? "true" : "false"); }
  });
}
function cpaMostrarPedidosAcao(situacaoBruta) {
  cpaSituacaoPedidos = CPA_SITUACOES_PEDIDOS.includes(situacaoBruta) ? situacaoBruta : "AGUARDANDO";
  cpaAplicarPilulasPedidos();
  cpaCarregarPedidosAcao();
}
async function cpaCarregarPedidosAcao() {
  if (!cpaEhGestao()) return;
  const congregacaoId = cpaInteiro(cpaTexto("cpaPedCong"));
  const seq = ++cpaSeqPed;
  cpaPedFormAberto = 0;
  cpaEscrever("cpaPedMsg", "Carregando…", false);
  const data = await cpaObter(`pedidos?situacao=${encodeURIComponent(cpaSituacaoPedidos)}${congregacaoId ? `&congregacaoId=${congregacaoId}` : ""}`);
  if (seq !== cpaSeqPed) return;
  const lista = cpaEl("cpaPedLista");
  if (data.sucesso === false || !Array.isArray(data.pedidos)) {
    cpaPedidos = [];
    if (lista) lista.innerHTML = "";
    cpaMostrarResultado(data, "cpaPedMsg", true);
    return;
  }
  cpaPedidos = data.pedidos.filter(p => p && typeof p === "object" && cpaInteiro(p.pedidoId));
  const n = cpaPedidos.length, comRisco = cpaPedidos.filter(p => p.risco).length;
  cpaEscrever("cpaPedMsg", n ? `${n} ${n === 1 ? "pedido" : "pedidos"}${comRisco ? ` — ${comRisco} com SINAL DE RISCO: atenda primeiro` : ""}.` : "Nenhum pedido nesta situação.", comRisco > 0);
  if (lista) lista.innerHTML = cpaPedidos.map(cpaHtmlPedido).join("");
}
function cpaRotuloModeracao(p) {
  const base = cpaTem(CPA_ROTULO_MODERACAO, p.moderacao) ? CPA_ROTULO_MODERACAO[p.moderacao] : String(p.moderacao || "");
  return p.moderacao === "APROVADO" && p.boletimAte ? `${base} até ${calData(p.boletimAte)}` : base;
}
function cpaHtmlPedido(p) {
  const id = Number(p.pedidoId);
  const risco = p.risco === true;
  const aguardando = !risco && p.moderacao === "AGUARDANDO";
  const selos = [
    risco ? cpaSelo("cal-st-indeferido cpa-urgente", "🚨 SINAL DE RISCO") : cpaSelo(p.moderacao === "APROVADO" ? "cal-st-homologado" : p.moderacao === "AGUARDANDO" ? "cal-st-proposto" : "cal-st-cancelado", cpaRotuloModeracao(p)),
    cpaSelo("cal-st-deferido", p.categoriaRotulo || p.categoria),
    cpaSelo(p.podeBoletim ? "cal-st-homologado" : "cal-st-cancelado", p.podeBoletim ? "pode ir ao boletim sem nome" : "só para a liderança"),
    p.querContato ? cpaSelo("cal-st-proposto", "📞 quer que alguém fale com ele(a)") : "",
    p.soNivelGeral ? cpaSelo("cal-st-indeferido", "🔒 Só o nível geral (cita a liderança)") : ""
  ].join("");
  const aprovado = !risco && p.moderacao === "APROVADO";
  return `<div class="cal-cartao cpa-pedido${risco ? " cpa-pedido-risco" : ""}">
    ${risco ? `<div class="cpa-risco-topo" role="alert"><strong>🚨 Atenda agora.</strong> Este pedido fala de autolesão ou violência${p.riscoOrigem === "LIDERANCA" ? " (marcado pela liderança)" : " (a lista do sistema pegou)"}. Ele não vai ao boletim. Ligue para a pessoa ou vá até ela com mais alguém.</div>` : ""}
    ${risco && p.riscoCrianca ? "<p class='cnl-aviso-senha' role='note'>O pedido fala de criança ou adolescente junto com violência: registre também em Proteção de Crianças (a lei manda comunicar ao Conselho Tutelar imediatamente).</p>" : ""}
    <div class="cpa-selos">${selos}</div>
    <p class="cpa-texto">${escaparHtmlEbd(p.texto)}</p>
    <dl class="cpa-dados">
      ${cpaCampo("Para quem", escaparHtmlEbd(p.paraQuemRotulo || p.paraQuem))}
      ${cpaCampo("Quem pediu", escaparHtmlEbd(p.solicitante || "(sem nome)"))}
      ${cpaCampo("Contato", p.solicitanteContato ? cpaHtmlContato(p.solicitanteContato) : "")}
      ${cpaCampo("Registrado por", p.registradoPor && p.registradoPor !== p.solicitante ? escaparHtmlEbd(p.registradoPor) : "")}
      ${cpaCampo("Congregação", escaparHtmlEbd(p.congregacaoNome))}
      ${cpaCampo("Recebido em", cpaDataHora(p.criadoEm))}
      ${cpaCampo("Linha no boletim", p.textoBoletim ? escaparHtmlEbd(p.textoBoletim) : "")}
      ${cpaCampo("Moderado por", p.moderadoPor ? `${escaparHtmlEbd(p.moderadoPor)} (${cpaDataHora(p.moderadoEm)})` : "")}
      ${cpaCampo("Alarme falso desmarcado", !risco && p.riscoJaTeve && p.riscoDesmarcadoMotivo ? `${escaparHtmlEbd(p.riscoDesmarcadoMotivo)} (${cpaDataHora(p.riscoDesmarcadoEm)})` : "")}
    </dl>
    ${risco ? `<div class="cpa-ajuda cpa-ajuda-risco">${cpaHtmlContatos(null)}</div>` : ""}
    <div class="psc-acoes">
      ${aguardando && p.podeBoletim ? `<button type="button" class="btn-confirmar cpa-btn" data-on-click="cpaAbrirPublicarAcao" data-args-click="${argsAttr(id, ARG.elemento)}">📖 Publicar no boletim</button>` : ""}
      ${aguardando ? `<button type="button" class="btn-confirmar btn-secundario cpa-btn" data-on-click="cpaMarcarLidoAcao" data-args-click="${argsAttr(id, ARG.elemento)}">✔️ Marcar como lido</button>` : ""}
      ${aprovado ? `<button type="button" class="btn-confirmar btn-secundario cpa-btn" data-on-click="cpaMarcarLidoAcao" data-args-click="${argsAttr(id, ARG.elemento)}">Tirar do boletim</button>` : ""}
      ${p.itemId && p.itemAberto !== false ? `<button type="button" class="btn-confirmar btn-secundario cpa-btn" data-on-click="cpaVerItemAcao" data-args-click="${argsAttr(Number(p.itemId), ARG.elemento)}">📂 Ver acompanhamento</button>` : ""}
      ${!p.itemId || p.itemAberto === false ? `<button type="button" class="btn-confirmar btn-secundario cpa-btn" data-on-click="cpaAcompanharPedidoAcao" data-args-click="${argsAttr(id, ARG.elemento)}">📂 Abrir acompanhamento</button>` : ""}
      ${risco ? `<button type="button" class="btn-confirmar btn-secundario cpa-btn" data-on-click="cpaAbrirDesmarcarAcao" data-args-click="${argsAttr(id, ARG.elemento)}">Desmarcar (alarme falso)</button>`
        : `<button type="button" class="btn-confirmar btn-perigo cpa-btn" data-on-click="cpaMarcarRiscoAcao" data-args-click="${argsAttr(id, ARG.elemento)}">🚨 Marcar sinal de risco</button>`}
    </div>
    <div id="cpaPedForm${id}"></div>
    <p id="cpaPedMsg${id}" class="subtitle" role="status" aria-live="polite"></p>
  </div>`;
}
function cpaPedido(pedidoId) { const id = cpaInteiro(pedidoId); return id ? cpaPedidos.find(p => Number(p.pedidoId) === id) || null : null; }
function cpaFecharFormPedido() {
  if (cpaPedFormAberto) { const el = cpaEl(`cpaPedForm${cpaPedFormAberto}`); if (el) el.innerHTML = ""; }
  cpaPedFormAberto = 0;
}
function cpaFecharFormPedidoAcao() {
  const id = cpaPedFormAberto;
  cpaFecharFormPedido();
  const gatilho = cpaGatilhoForm;
  cpaGatilhoForm = null;
  if (gatilho && gatilho.isConnected) cpaFocar(gatilho);
  else if (id) cpaFocarId(`cpaPedMsg${id}`);
}
function cpaAbrirPublicarAcao(pedidoId, gatilho) {
  const p = cpaPedido(pedidoId);
  if (!p || p.risco || !p.podeBoletim) return;
  const id = Number(p.pedidoId);
  cpaFecharFormPedido();
  const cx = cpaEl(`cpaPedForm${id}`);
  if (!cx) return;
  cpaPedFormAberto = id;
  cpaGatilhoForm = gatilho && typeof gatilho === "object" ? gatilho : null;
  cx.innerHTML = `<div class="cal-form cpa-form" role="group" aria-labelledby="cpaPubTitulo">
    <h5 id="cpaPubTitulo">📖 Publicar no boletim de oração</h5>
    <p class="psc-legenda">O boletim <strong>nunca leva o texto do pedido</strong>: só esta linha, sem nome. Pode reescrever (de 10 a ${cpaLimite("boletim")} caracteres), mas uma linha com o nome de quem pediu é recusada. Fica 14 dias no boletim.</p>
    <div class="input-group">
      <label for="cpaPubTexto">Linha do boletim</label>
      <textarea id="cpaPubTexto" rows="2" maxlength="${cpaLimite("boletim")}" autocomplete="off">${escaparHtmlEbd(p.sugestaoBoletim || "")}</textarea>
    </div>
    <div class="psc-acoes">
      <button type="button" class="btn-confirmar cpa-btn" data-on-click="cpaEnviarPublicarAcao" data-args-click="${argsAttr(id, ARG.elemento)}">📖 Publicar</button>
      <button type="button" class="btn-confirmar btn-secundario cpa-btn" data-on-click="cpaFecharFormPedidoAcao">Fechar</button>
    </div>
    <p id="cpaPubMsg" class="subtitle" role="status" aria-live="polite"></p>
  </div>`;
  cpaFocarId("cpaPubTexto");
}
function cpaAbrirDesmarcarAcao(pedidoId, gatilho) {
  const p = cpaPedido(pedidoId);
  if (!p || !p.risco) return;
  const id = Number(p.pedidoId);
  cpaFecharFormPedido();
  const cx = cpaEl(`cpaPedForm${id}`);
  if (!cx) return;
  cpaPedFormAberto = id;
  cpaGatilhoForm = gatilho && typeof gatilho === "object" ? gatilho : null;
  cx.innerHTML = `<div class="cal-form cpa-form" role="group" aria-labelledby="cpaDesTitulo">
    <h5 id="cpaDesTitulo">Desmarcar o sinal de risco (alarme falso)</h5>
    <p class="psc-legenda">Só depois de falar com a pessoa. O pedido volta para a moderação comum e o acompanhamento continua aberto. Nada é apagado. Pede a confirmação reforçada (chave de acesso ou código por e-mail).</p>
    <div class="input-group">
      <label for="cpaDesMotivo">Por que é alarme falso (de 5 a ${cpaLimite("observacao")} caracteres)</label>
      <textarea id="cpaDesMotivo" rows="2" maxlength="${cpaLimite("observacao")}" autocomplete="off"></textarea>
    </div>
    <div class="psc-acoes">
      <button type="button" class="btn-confirmar btn-perigo cpa-btn" data-on-click="cpaEnviarDesmarcarAcao" data-args-click="${argsAttr(id, ARG.elemento)}">Desmarcar o sinal de risco</button>
      <button type="button" class="btn-confirmar btn-secundario cpa-btn" data-on-click="cpaFecharFormPedidoAcao">Fechar</button>
    </div>
    <p id="cpaDesMsg" class="subtitle" role="status" aria-live="polite"></p>
  </div>`;
  cpaFocarId("cpaDesMotivo");
}
// depois de um ato num pedido: a lista é relida e a mensagem do servidor fica em cima da lista
async function cpaDepoisDoPedido(data) {
  const geracao = cpaGeracao;
  const msg = cpaMsgErro(data);
  const alerta = data.sucesso === false || data.avisada === false;
  if (!data.jaAvisado) mostrarToast(msg, alerta ? "erro" : "sucesso");
  await cpaCarregarPedidosAcao();
  if (geracao === cpaGeracao) cpaEscrever("cpaPedMsg", msg, alerta);
}
// recusa do servidor num pedido: 409 e 404 relêem a lista (ele mudou ou saiu do alcance); o resto fica no formulário
async function cpaFalhaDoPedido(data, idMsg) {
  if (data.httpStatus === 409 || data.httpStatus === 404) { await cpaDepoisDoPedido(data); return; }
  cpaMostrarResultado(data, cpaEl(idMsg) ? idMsg : "cpaPedMsg", true);
}
async function cpaEnviarPublicarAcao(pedidoId, botao) {
  const p = cpaPedido(pedidoId);
  if (!p) return;
  const texto = cpaTexto("cpaPubTexto");
  const problema = cpaProblemaTexto(texto, { nome: "a linha do boletim", min: 10, max: cpaLimite("boletim"), obrigatorio: true });
  if (problema) { cpaEscrever("cpaPubMsg", problema, true); return; }
  const geracao = cpaGeracao, id = Number(p.pedidoId);
  await cpaProteger(botao, async () => {
    cpaEscrever("cpaPubMsg", "Publicando…", false);
    const data = await cpaPostar("moderar", { pedidoId: id, decisao: "APROVAR", textoBoletim: texto });
    if (geracao !== cpaGeracao) return;
    if (data.sucesso === false) { await cpaFalhaDoPedido(data, "cpaPubMsg"); return; }
    await cpaDepoisDoPedido(data);
  }, `moderar${id}`);
}
async function cpaMarcarLidoAcao(pedidoId, botao) {
  const p = cpaPedido(pedidoId);
  if (!p) return;
  const geracao = cpaGeracao, id = Number(p.pedidoId);
  await cpaProteger(botao, async () => {
    const data = await cpaPostar("moderar", { pedidoId: id, decisao: "NAO_PUBLICAR" });
    if (geracao !== cpaGeracao) return;
    if (data.sucesso === false) { await cpaFalhaDoPedido(data, `cpaPedMsg${id}`); return; }
    await cpaDepoisDoPedido(data);
  }, `moderar${id}`);
}
async function cpaMarcarRiscoAcao(pedidoId, botao) {
  const p = cpaPedido(pedidoId);
  if (!p || p.risco) return;
  if (!(await confirmarAcao("Marcar SINAL DE RISCO avisa agora toda a liderança do território (o aviso não leva o texto), tira o pedido do boletim e deixa o acompanhamento urgente (24 horas). Marcar?", "Marcar sinal de risco"))) return;
  const geracao = cpaGeracao, id = Number(p.pedidoId);
  await cpaProteger(botao, async () => {
    const data = await cpaPostar("risco", { pedidoId: id, marcar: true });
    if (geracao !== cpaGeracao) return;
    if (data.sucesso === false) { await cpaFalhaDoPedido(data, `cpaPedMsg${id}`); return; }
    await cpaDepoisDoPedido(data);
  }, `risco${id}`);
}
async function cpaEnviarDesmarcarAcao(pedidoId, botao) {
  const p = cpaPedido(pedidoId);
  if (!p || !p.risco) return;
  const motivo = cpaTexto("cpaDesMotivo");
  const problema = cpaProblemaTexto(motivo, { nome: "o motivo", min: 5, max: cpaLimite("observacao"), obrigatorio: true });
  if (problema) { cpaEscrever("cpaDesMsg", problema, true); return; }
  const geracao = cpaGeracao, id = Number(p.pedidoId);
  await cpaProteger(botao, async () => {
    cpaEscrever("cpaDesMsg", "Gravando…", false);
    const data = await cpaPostar("risco", { pedidoId: id, marcar: false, motivo });   // 428: confirmação reforçada e a chamada é repetida uma vez
    if (geracao !== cpaGeracao) return;
    if (data.sucesso === false) { await cpaFalhaDoPedido(data, "cpaDesMsg"); return; }
    await cpaDepoisDoPedido(data);
  }, `risco${id}`);
}
async function cpaAcompanharPedidoAcao(pedidoId, botao) {
  const p = cpaPedido(pedidoId);
  if (!p || (p.itemId && p.itemAberto !== false)) return;   // já tem um acompanhamento aberto (o encerrado pode ganhar outro)
  const geracao = cpaGeracao, id = Number(p.pedidoId);
  await cpaProteger(botao, async () => {
    const data = await cpaPostar("acompanhar-pedido", { pedidoId: id });
    if (geracao !== cpaGeracao) return;
    if (data.sucesso === false) { await cpaFalhaDoPedido(data, `cpaPedMsg${id}`); return; }
    await cpaDepoisDoPedido(data);
  }, `acompanhar${id}`);
}
async function cpaVerItemAcao(itemId, gatilho) {
  const id = cpaInteiro(itemId);
  if (!id || !cpaEhGestao()) return;
  cpaSecaoAtual = "fila";
  cpaAplicarSecao("fila");
  cpaSeqPed++; cpaPedidos = []; cpaEsvaziar(["cpaPedLista"]);   // os textos dos pedidos não ficam escondidos na página
  cpaPedFormAberto = 0; cpaEsvaziar(["cpaRegPedCx"]); cpaEscrever("cpaPedMsg", "", false);
  cpaCarregarFilaAcao();
  // o botão do pedido sai da página: ao voltar do acompanhamento, o foco vai para o título da fila
  await cpaAbrirDetalheAcao("Ges", id, gatilho && gatilho.isConnected === false ? gatilho : null);
}

// -- o pedido recebido em mãos (a liderança registra) --
function cpaAbrirFormRegistrarPedidoAcao(gatilho) {
  const cx = cpaEl("cpaRegPedCx");
  if (!cx || !cpaEhGestao() || !cpaCatalogos) return;
  if (cx.innerHTML !== "") { cpaFocarId("cpaRpCong"); return; }
  cpaGatilhoForm = gatilho && typeof gatilho === "object" ? gatilho : null;
  cpaBuscaRes.regMembro = []; cpaEscolhas.regMembro = null;
  const c = cpaCatalogos;
  cx.innerHTML = `<div class="cal-form cpa-form" role="group" aria-labelledby="cpaRpTitulo">
    <h5 id="cpaRpTitulo">✍️ Registrar pedido recebido em mãos</h5>
    <p class="psc-legenda">Para o pedido que chegou num papel, na porta ou por telefone. Passa pela mesma moderação e pela mesma lista de sinal de risco.</p>
    <div class="input-group">
      <label for="cpaRpCong">Congregação</label>
      <select id="cpaRpCong" data-on-change="cpaMudouCongRegAcao">${cpaOpcoes(cpaCongregacoes, x => String(Number(x.congregacaoId)), x => x.nome, "Escolha a congregação")}</select>
    </div>
    <fieldset class="cpa-grupo">
      <legend>Quem pediu está no cadastro?</legend>
      <label class="cpa-opcao"><input type="radio" name="cpaRpCad" id="cpaRpCadSim" value="sim" data-on-change="cpaMudouCadastroRegAcao" /> Sim, é membro</label>
      <label class="cpa-opcao"><input type="radio" name="cpaRpCad" id="cpaRpCadNao" value="nao" data-on-change="cpaMudouCadastroRegAcao" /> Não é do cadastro</label>
    </fieldset>
    <div id="cpaRpMembroCx" style="display:none;">
      <div class="input-group">
        <label for="cpaRpBusca">Nome de quem pediu</label>
        <input type="text" id="cpaRpBusca" maxlength="60" autocomplete="off" />
      </div>
      <div class="psc-acoes"><button type="button" class="btn-confirmar btn-secundario cpa-btn" data-on-click="cpaBuscarAcao" data-args-click="${argsAttr("regMembro", ARG.elemento)}">🔍 Buscar</button></div>
      <div id="cpaRpBuscaRes" role="status" aria-live="polite"></div>
      <p id="cpaRpEscolhido" class="cpa-escolhido" role="status"></p>
    </div>
    <div id="cpaRpForaCx" style="display:none;" class="cal-form-grade">
      <div class="input-group">
        <label for="cpaRpNome">Nome de quem pediu</label>
        <input type="text" id="cpaRpNome" maxlength="${cpaLimite("nome")}" autocomplete="off" />
      </div>
      <div class="input-group">
        <label for="cpaRpContato">Contato (opcional)</label>
        <input type="text" id="cpaRpContato" maxlength="${cpaLimite("contato")}" autocomplete="off" />
      </div>
    </div>
    <div class="cal-form-grade">
      <div class="input-group">
        <label for="cpaRpCategoria">Assunto</label>
        <select id="cpaRpCategoria">${cpaOpcoes(c.categorias, x => x.codigo, x => x.rotulo, "Escolha o assunto")}</select>
      </div>
      <div class="input-group">
        <label for="cpaRpParaQuem">Para quem é a oração</label>
        <select id="cpaRpParaQuem">${cpaOpcoes(c.paraQuem, x => x.codigo, x => x.rotulo, null)}</select>
      </div>
    </div>
    <div class="input-group">
      <label for="cpaRpTexto">O pedido (de 5 a ${cpaLimite("pedido")} caracteres)</label>
      <textarea id="cpaRpTexto" rows="4" maxlength="${cpaLimite("pedido")}" autocomplete="off" spellcheck="false"></textarea>
    </div>
    <fieldset class="cpa-grupo">
      <legend>Pode ir ao boletim de oração?</legend>
      <label class="cpa-opcao"><input type="radio" name="cpaRpBol" id="cpaRpBolSim" value="sim" /> Pode ir ao boletim sem o nome</label>
      <label class="cpa-opcao"><input type="radio" name="cpaRpBol" id="cpaRpBolNao" value="nao" /> Só para a liderança</label>
    </fieldset>
    <label class="cpa-opcao" for="cpaRpQuerContato"><input type="checkbox" id="cpaRpQuerContato" /> A pessoa quer que alguém da liderança fale com ela</label>
    <div class="psc-acoes">
      <button type="button" class="btn-confirmar cpa-btn" id="cpaRpBotao" data-on-click="cpaEnviarRegistrarPedidoAcao" data-args-click="${argsAttr(ARG.elemento)}">💾 Registrar o pedido</button>
      <button type="button" class="btn-confirmar btn-secundario cpa-btn" data-on-click="cpaFecharRegistrarPedidoAcao">Fechar</button>
    </div>
    <p id="cpaRpMsg" class="subtitle" role="status" aria-live="polite"></p>
    <div id="cpaRpResposta" tabindex="-1"></div>
  </div>`;
  const cong = cpaInteiro(cpaTexto("cpaPedCong")) || (cpaCongregacoes.length === 1 ? Number(cpaCongregacoes[0].congregacaoId) : 0);
  if (cong) { const sel = cpaEl("cpaRpCong"); if (sel) sel.value = String(cong); }
  cpaFocarId("cpaRpCong");
}
function cpaFecharRegistrarPedidoAcao() {
  cpaEsvaziar(["cpaRegPedCx"]);
  cpaBuscaRes.regMembro = []; cpaEscolhas.regMembro = null;
  const gatilho = cpaGatilhoForm;
  cpaGatilhoForm = null;
  if (gatilho && gatilho.isConnected) cpaFocar(gatilho);
}
function cpaMudouCadastroRegAcao() {
  const sim = cpaEscolhaSimNao("cpaRpCadSim", "cpaRpCadNao");
  cpaMostrar("cpaRpMembroCx", sim === true);
  const fora = cpaEl("cpaRpForaCx");
  if (fora) fora.style.display = sim === false ? "" : "none";
}
function cpaMudouCongRegAcao() {
  cpaBuscaRes.regMembro = []; cpaEscolhas.regMembro = null;
  cpaEsvaziar(["cpaRpBuscaRes"]);
  const el = cpaEl("cpaRpEscolhido");
  if (el) el.textContent = "";
}
async function cpaEnviarRegistrarPedidoAcao(botao) {
  if (!cpaCatalogos) return;
  const congregacaoId = cpaInteiro(cpaTexto("cpaRpCong"));
  const cadastro = cpaEscolhaSimNao("cpaRpCadSim", "cpaRpCadNao");
  const categoria = cpaTexto("cpaRpCategoria");
  const paraQuem = cpaTexto("cpaRpParaQuem") || "PROPRIO";
  const texto = cpaTexto("cpaRpTexto");
  const podeBoletim = cpaEscolhaSimNao("cpaRpBolSim", "cpaRpBolNao");
  const corpo = { congregacaoId, categoria, paraQuem, texto, podeBoletim, querContato: cpaMarcado("cpaRpQuerContato") };
  let problema = "";
  if (!congregacaoId) problema = "Escolha a congregação.";
  else if (cadastro == null) problema = "Diga se quem pediu está no cadastro.";
  else if (cadastro && !cpaEscolhas.regMembro) problema = "Busque quem pediu pelo nome e toque em Escolher.";
  else if (!cadastro) {
    const nome = cpaTexto("cpaRpNome"), contato = cpaTexto("cpaRpContato");
    problema = cpaProblemaTexto(nome, { nome: "o nome de quem pediu", min: 2, max: cpaLimite("nome"), obrigatorio: true }) || cpaProblemaTexto(contato, { nome: "o contato", min: 4, max: cpaLimite("contato") });
    corpo.solicitanteNome = nome;
    if (contato) corpo.solicitanteContato = contato;
  }
  if (!problema && cadastro) corpo.membroId = cpaEscolhas.regMembro.membroId;
  if (!problema && !cpaCatalogos.categorias.some(x => x.codigo === categoria)) problema = "Escolha o assunto do pedido.";
  if (!problema) problema = cpaProblemaTexto(texto, { nome: "o pedido", min: 5, max: cpaLimite("pedido"), obrigatorio: true });
  if (!problema && podeBoletim == null) problema = "Diga se o pedido pode ir ao boletim (sem o nome) ou é só para a liderança.";
  if (problema) { cpaEscrever("cpaRpMsg", problema, true); return; }
  const geracao = cpaGeracao;
  await cpaProteger(botao, async () => {
    cpaEscrever("cpaRpMsg", "Gravando…", false);
    const data = await cpaPostar("registrar-pedido", corpo);
    if (geracao !== cpaGeracao || !cpaEl("cpaRpMsg")) return;
    if (data.sucesso === false) { cpaMostrarResultado(data, "cpaRpMsg", true); return; }
    if (data.risco) {
      // sinal de risco: a resposta do servidor (mensagem + telefones) fica no formulário, em destaque, para quem registrou ler para a pessoa
      cpaEscrever("cpaRpMsg", "", false);
      cpaMostrarRespostaRisco("cpaRpResposta", data, true);
      const campo = cpaEl("cpaRpTexto");
      if (campo && cpaTexto("cpaRpTexto") === texto) campo.value = "";
      cpaCarregarPedidosAcao();
      return;
    }
    const msg = cpaMsgErro(data);
    cpaFecharRegistrarPedidoAcao();
    if (!data.jaAvisado) mostrarToast(msg, "sucesso");
    await cpaCarregarPedidosAcao();
    if (geracao === cpaGeracao) cpaEscrever("cpaPedMsg", msg, false);
  }, "registrar-pedido");
}

// ============================================================================
// c) O BOLETIM DE ORAÇÃO (só as linhas sem nome) e d) O PAINEL
// ============================================================================
function cpaHtmlBoletim(linhas, comCongregacao) {
  const lista = Array.isArray(linhas) ? linhas.filter(l => l && typeof l === "object" && l.linha) : [];
  if (!lista.length) return "<p class='psc-legenda'>Nenhuma linha no boletim agora.</p>";
  const grupos = [];
  lista.forEach(l => {
    const nome = String(l.congregacaoNome == null ? "" : l.congregacaoNome);
    let g = grupos.find(x => x.nome === nome);
    if (!g) { g = { nome, linhas: [] }; grupos.push(g); }
    g.linhas.push(l);
  });
  return grupos.map(g => `<section class="cpa-boletim-grupo">
    ${comCongregacao ? `<h5>Congregação ${escaparHtmlEbd(g.nome)}</h5>` : ""}
    <ul class="cpa-boletim-lista">${g.linhas.map(l => `<li>🙏 ${escaparHtmlEbd(l.linha)} <span class="cpa-boletim-ate">(até ${cpaData(l.ate)})</span></li>`).join("")}</ul>
  </section>`).join("");
}
async function cpaCarregarBoletimAcao() {
  if (!cpaEhGestao()) return;
  const congregacaoId = cpaInteiro(cpaTexto("cpaBolCong"));
  const seq = ++cpaSeqBol;
  cpaEscrever("cpaBolMsg", "Carregando…", false);
  const data = await cpaObter(`boletim${congregacaoId ? `?congregacaoId=${congregacaoId}` : ""}`);
  if (seq !== cpaSeqBol) return;
  const cx = cpaEl("cpaBolImprimivel");
  if (data.sucesso === false || !Array.isArray(data.linhas)) { if (cx) cx.innerHTML = ""; cpaMostrarResultado(data, "cpaBolMsg", true); return; }
  cpaEscrever("cpaBolMsg", "", false);
  if (cx) cx.innerHTML = `<h4 class="cpa-boletim-titulo">🙏 Boletim de oração — ${escaparHtmlEbd(calData(calHojeBrasilia()))}</h4>
    <p class="psc-legenda">Pedidos sem nome, aprovados pela liderança. Cada linha fica 14 dias.</p>
    ${cpaHtmlBoletim(data.linhas, true)}`;
}
function cpaImprimirBoletimAcao() {
  const classes = document.body && document.body.classList;
  if (classes) classes.add("cpa-imprimindo");
  try { window.print(); } finally { if (classes) classes.remove("cpa-imprimindo"); }
}
function cpaNumeroOuTraco(v) { return v == null || !Number.isFinite(Number(v)) ? "—" : String(Number(v)).replace(".", ","); }
async function cpaCarregarPainelAcao() {
  if (!cpaEhGestao()) return;
  const seq = ++cpaSeqPainel;
  cpaEscrever("cpaPainelMsg", "Carregando…", false);
  const data = await cpaObter("painel");
  if (seq !== cpaSeqPainel) return;
  const cx = cpaEl("cpaPainelLista");
  if (data.sucesso === false || !Array.isArray(data.congregacoes)) { if (cx) cx.innerHTML = ""; cpaMostrarResultado(data, "cpaPainelMsg", true); return; }
  const linhas = data.congregacoes.filter(c => c && typeof c === "object");
  cpaEscrever("cpaPainelMsg", linhas.length ? "" : "Nenhuma congregação no seu território.", false);
  if (!cx) return;
  const n = (v) => escaparHtmlEbd(cpaNumeroOuTraco(v));
  cx.innerHTML = linhas.length ? `<div class="cpa-rolagem"><table class="tabela-frequencia cpa-tabela">
    <thead><tr><th scope="col">Congregação</th><th scope="col">Abertos</th><th scope="col">Vencidos</th><th scope="col">Sem responsável</th><th scope="col">Urgentes</th>
      <th scope="col">Detectados (30 dias)</th><th scope="col">Horas até o 1º contato</th><th scope="col">Pedidos esperando</th><th scope="col">Pedidos com risco</th></tr></thead>
    <tbody>${linhas.map(c => `<tr>
      <th scope="row">${escaparHtmlEbd(c.congregacaoNome)}</th><td>${n(c.abertos)}</td><td class="${Number(c.vencidos) > 0 ? "cpa-num-alerta" : ""}">${n(c.vencidos)}</td>
      <td class="${Number(c.semResponsavel) > 0 ? "cpa-num-alerta" : ""}">${n(c.semResponsavel)}</td><td>${n(c.urgentes)}</td><td>${n(c.detectados30Dias)}</td>
      <td>${n(c.horasAtePrimeiroContato)}</td><td>${n(c.pedidosAguardando)}</td><td class="${Number(c.pedidosRisco) > 0 ? "cpa-num-alerta" : ""}">${n(c.pedidosRisco)}</td>
    </tr>`).join("")}</tbody></table></div>` : "";
}

// ============================================================================
// 2) MEU PAINEL → CUIDADO (qualquer login, inclusive PIN)
// ============================================================================
async function cpaCarregarMeuPainelAcao() {
  cpaVerificarDono();
  const aviso = cpaEl("cpaMeuMsg");
  if (!aviso) return;
  if (!authToken) {
    cpaLimparTela();
    aviso.textContent = "Entre com a sua matrícula e o seu PIN (ou senha) para pedir oração ou visita.";
    return;
  }
  const seq = ++cpaSeqMeu;
  cpaEscrever("cpaMeuMsg", "Carregando…", false);
  const [catalogo, meus] = await Promise.all([cpaGarantirCatalogos(), cpaObter("meus")]);
  if (seq !== cpaSeqMeu || !cpaMeuVisivel()) return;   // resposta velha, outra sub-aba ou outro login
  cpaEscrever("cpaMeuMsg", catalogo ? "" : CPA_MSG_SEM_CATALOGO, !catalogo);
  // Meus acompanhamentos: só aparece para quem foi nomeado responsável
  if (meus.sucesso !== false && Array.isArray(meus.itens)) {
    cpaMeus = meus.itens.filter(i => i && typeof i === "object" && cpaInteiro(i.itemId));
    cpaRenderMeus();
  } else if (meus.httpStatus !== 404) cpaEscrever("cpaMeuMsg", `Não foi possível carregar os seus acompanhamentos: ${cpaMsgErro(meus)}`, true);
  cpaMontarFormsMeu();
  cpaCarregarMeusPedidosAcao();
  cpaCarregarBoletimMeu();
}
function cpaRenderMeus() {
  const lista = cpaEl("cpaMeusLista");
  cpaMostrar("cpaMeusCx", cpaMeus.length > 0 || !!(cpaDet && cpaDet.ctx === "Meu"));   // com um acompanhamento aberto a seção fica, mesmo que a lista tenha esvaziado
  if (!lista) return;
  const abertos = cpaMeus.filter(i => i.status === "ABERTO").length;
  lista.innerHTML = cpaMeus.length ? `<p class="subtitle">${abertos} em aberto${cpaMeus.length > abertos ? ` e ${cpaMeus.length - abertos} encerrado(s) nos últimos 30 dias` : ""}.</p>${cpaMeus.map(i => cpaHtmlCartao(i, "Meu")).join("")}` : "";
}
async function cpaRecarregarMeus() {
  const seq = ++cpaSeqMeusLista;
  const meus = await cpaObter("meus");
  if (seq !== cpaSeqMeusLista || meus.sucesso === false || !Array.isArray(meus.itens)) return;
  cpaMeus = meus.itens.filter(i => i && typeof i === "object" && cpaInteiro(i.itemId));
  cpaRenderMeus();
}
// os formulários de pedido só se montam uma vez por visita (não apagam o que a pessoa está escrevendo); os telefones de ajuda ficam sempre
function cpaMontarFormsMeu() {
  const ajuda = cpaEl("cpaAjudaFixa");
  if (ajuda) ajuda.innerHTML = cpaHtmlAjudaFixa();
  const c = cpaCatalogos;
  const fo = cpaEl("cpaOracaoForm"), fv = cpaEl("cpaVisitaForm");
  if (!c) return;
  if (fo && fo.innerHTML === "") {
    fo.innerHTML = `<div class="cal-form cpa-form">
      <div class="input-group">
        <label for="cpaPoCategoria">Assunto</label>
        <select id="cpaPoCategoria">${cpaOpcoes(c.categorias, x => x.codigo, x => x.rotulo, "Escolha o assunto")}</select>
      </div>
      <fieldset class="cpa-grupo">
        <legend>O pedido é por quem?</legend>
        <label class="cpa-opcao"><input type="radio" name="cpaPoPara" id="cpaPoParaMim" value="PROPRIO" checked /> Por mim</label>
        <label class="cpa-opcao"><input type="radio" name="cpaPoPara" id="cpaPoParaOutra" value="OUTRA_PESSOA" /> Por outra pessoa</label>
      </fieldset>
      <div class="input-group">
        <label for="cpaPoTexto">Escreva o seu pedido (de 5 a ${cpaLimite("pedido")} caracteres)</label>
        <textarea id="cpaPoTexto" rows="5" maxlength="${cpaLimite("pedido")}" autocomplete="off" spellcheck="false" data-on-input="cpaContarPedidoAcao"></textarea>
        <p class="psc-legenda"><span id="cpaPoContador">0</span>/${cpaLimite("pedido")} caracteres. Quem lê é a liderança da sua congregação.</p>
      </div>
      <fieldset class="cpa-grupo">
        <legend>Pode ir ao boletim de oração? (escolha uma)</legend>
        <label class="cpa-opcao"><input type="radio" name="cpaPoBol" id="cpaPoBolSim" value="sim" /> Pode ir ao boletim <strong>sem o meu nome</strong> (só uma linha como "Alguém da congregação pede oração pela saúde")</label>
        <label class="cpa-opcao"><input type="radio" name="cpaPoBol" id="cpaPoBolNao" value="nao" /> Só para a liderança</label>
      </fieldset>
      <label class="cpa-opcao" for="cpaPoQuerContato"><input type="checkbox" id="cpaPoQuerContato" /> Quero que alguém da liderança fale comigo</label>
      <div class="psc-acoes"><button type="button" class="btn-confirmar cpa-btn cpa-btn-principal" id="cpaPoBotao" data-on-click="cpaEnviarOracaoAcao" data-args-click="${argsAttr(ARG.elemento)}">🙏 Enviar o pedido de oração</button></div>
      <p id="cpaPoMsg" class="subtitle" role="status" aria-live="polite"></p>
    </div>`;
  }
  if (fv && fv.innerHTML === "") {
    fv.innerHTML = `<div class="cal-form cpa-form">
      <div class="input-group">
        <label for="cpaPvMotivo">Por que você quer uma visita (de 5 a ${cpaLimite("motivo")} caracteres)</label>
        <textarea id="cpaPvMotivo" rows="3" maxlength="${cpaLimite("motivo")}" autocomplete="off" spellcheck="false"></textarea>
      </div>
      <label class="cpa-opcao" for="cpaPvHospital"><input type="checkbox" id="cpaPvHospital" /> Estou ou estive internado(a)</label>
      <div class="input-group">
        <label for="cpaPvContato">Melhor contato ou horário (opcional)</label>
        <input type="text" id="cpaPvContato" maxlength="${cpaLimite("contato")}" autocomplete="off" />
      </div>
      <p class="psc-legenda">A visita é sempre feita por duas pessoas da igreja.</p>
      <div class="psc-acoes"><button type="button" class="btn-confirmar cpa-btn cpa-btn-principal" id="cpaPvBotao" data-on-click="cpaEnviarVisitaAcao" data-args-click="${argsAttr(ARG.elemento)}">🏠 Pedir a visita</button></div>
      <p id="cpaPvMsg" class="subtitle" role="status" aria-live="polite"></p>
    </div>`;
  }
}
function cpaContarPedidoAcao() { const c = cpaEl("cpaPoContador"); if (c) c.textContent = String(cpaTexto("cpaPoTexto").length); }
// A resposta de um pedido com sinal de risco: a mensagem do SERVIDOR tal qual (ela só diz "a liderança foi avisada" quando o aviso saiu de verdade) e os telefones.
function cpaMostrarRespostaRisco(idCx, data, paraLideranca) {
  const cx = cpaEl(idCx);
  if (!cx) return;
  cx.innerHTML = `<div class="cpa-risco-resposta" role="alert">
    <h4>${paraLideranca ? "🚨 Pedido com sinal de risco: atenda agora" : "💛 Você não está sozinho(a)"}</h4>
    <p class="cpa-risco-msg">${escaparHtmlEbd(cpaMsgErro(data))}</p>
    ${cpaHtmlContatos(data.ajuda)}
  </div>`;
  cpaFocar(cx);
}
function cpaMostrarRespostaComum(idCx, data, ok) {
  const cx = cpaEl(idCx);
  if (!cx) return;
  cx.innerHTML = ok ? `<div class="cpa-ok" role="status"><p>✅ ${escaparHtmlEbd(cpaMsgErro(data))}</p></div>`
    : `<div class="cpa-falha" role="alert"><p>${escaparHtmlEbd(cpaMsgErro(data))}</p>${Array.isArray(data.ajuda) || data.falhaDeRede ? `<p>${escaparHtmlEbd(CPA_MSG_PEDIDO_NAO_FOI)}</p>${cpaHtmlContatos(data.ajuda)}` : ""}</div>`;
  cpaFocar(cx);
}
async function cpaEnviarOracaoAcao(botao) {
  if (!cpaCatalogos) { cpaEscrever("cpaPoMsg", CPA_MSG_SEM_CATALOGO, true); return; }
  const categoria = cpaTexto("cpaPoCategoria");
  const texto = cpaTexto("cpaPoTexto");
  const paraQuem = cpaMarcado("cpaPoParaOutra") ? "OUTRA_PESSOA" : "PROPRIO";
  const podeBoletim = cpaEscolhaSimNao("cpaPoBolSim", "cpaPoBolNao");
  let problema = "";
  if (!cpaCatalogos.categorias.some(x => x.codigo === categoria)) problema = "Escolha o assunto do pedido.";
  else problema = cpaProblemaTexto(texto, { nome: "o seu pedido", min: 5, max: cpaLimite("pedido"), obrigatorio: true });
  if (!problema && podeBoletim == null) problema = "Escolha se o pedido pode ir ao boletim (sem o seu nome) ou é só para a liderança.";
  if (problema) { cpaEscrever("cpaPoMsg", problema, true); return; }
  const corpo = { categoria, texto, paraQuem, podeBoletim, querContato: cpaMarcado("cpaPoQuerContato") };
  const geracao = cpaGeracao;
  await cpaProteger(botao, async () => {
    cpaEscrever("cpaPoMsg", "Enviando…", false);
    cpaEsvaziar(["cpaOracaoResultado"]);
    const data = await cpaPostar("pedir-oracao", corpo);
    if (geracao !== cpaGeracao || !cpaEl("cpaPoMsg")) return;
    cpaEscrever("cpaPoMsg", "", false);
    if (data.sucesso === false) { cpaMostrarRespostaComum("cpaOracaoResultado", data, false); return; }
    if (data.risco === true) cpaMostrarRespostaRisco("cpaOracaoResultado", data); else cpaMostrarRespostaComum("cpaOracaoResultado", data, true);
    // o que foi enviado sai do campo (o que a pessoa digitou depois, não)
    const campo = cpaEl("cpaPoTexto");
    if (campo && cpaTexto("cpaPoTexto") === texto) { campo.value = ""; cpaContarPedidoAcao(); }
    ["cpaPoBolSim", "cpaPoBolNao", "cpaPoQuerContato"].forEach(id => { const el = cpaEl(id); if (el) el.checked = false; });
    cpaCarregarMeusPedidosAcao();
  }, "pedir-oracao");
}
async function cpaEnviarVisitaAcao(botao) {
  const motivo = cpaTexto("cpaPvMotivo");
  const contato = cpaTexto("cpaPvContato");
  const problema = cpaProblemaTexto(motivo, { nome: "o motivo da visita", min: 5, max: cpaLimite("motivo"), obrigatorio: true }) || cpaProblemaTexto(contato, { nome: "o melhor contato ou horário", max: cpaLimite("contato") });
  if (problema) { cpaEscrever("cpaPvMsg", problema, true); return; }
  const corpo = { motivo, hospital: cpaMarcado("cpaPvHospital") };
  if (contato) corpo.contato = contato;
  const geracao = cpaGeracao;
  await cpaProteger(botao, async () => {
    cpaEscrever("cpaPvMsg", "Enviando…", false);
    cpaEsvaziar(["cpaVisitaResultado"]);
    const data = await cpaPostar("pedir-visita", corpo);
    if (geracao !== cpaGeracao || !cpaEl("cpaPvMsg")) return;
    cpaEscrever("cpaPvMsg", "", false);
    if (data.sucesso === false) { cpaMostrarRespostaComum("cpaVisitaResultado", data, false); return; }
    if (data.risco === true) cpaMostrarRespostaRisco("cpaVisitaResultado", data); else cpaMostrarRespostaComum("cpaVisitaResultado", data, true);
    const campo = cpaEl("cpaPvMotivo");
    if (campo && cpaTexto("cpaPvMotivo") === motivo) campo.value = "";
    const c2 = cpaEl("cpaPvContato");
    if (c2 && cpaTexto("cpaPvContato") === contato) c2.value = "";
    const h = cpaEl("cpaPvHospital");
    if (h) h.checked = false;
    cpaCarregarMeusPedidosAcao();
  }, "pedir-visita");
}
async function cpaCarregarMeusPedidosAcao() {
  if (!authToken) return;
  const seq = ++cpaSeqMeusPed;
  cpaEscrever("cpaMeusPedidosMsg", "Carregando…", false);
  const data = await cpaObter("meus-pedidos");
  if (seq !== cpaSeqMeusPed) return;
  const cx = cpaEl("cpaMeusPedidos");
  if (data.sucesso === false) { if (cx) cx.innerHTML = ""; cpaMostrarResultado(data, "cpaMeusPedidosMsg", true); return; }
  const oracao = Array.isArray(data.oracao) ? data.oracao.filter(p => p && typeof p === "object") : [];
  const visitas = Array.isArray(data.visitas) ? data.visitas.filter(v => v && typeof v === "object") : [];
  cpaEscrever("cpaMeusPedidosMsg", oracao.length || visitas.length ? "" : "Você ainda não fez nenhum pedido.", false);
  if (!cx) return;
  cx.innerHTML = `${oracao.length ? `<h5>🙏 Pedidos de oração</h5><ul class="cpa-meus-pedidos">${oracao.map(p => `<li>
      <strong>${escaparHtmlEbd(p.categoriaRotulo || p.categoria)}</strong>${p.paraQuem === "OUTRA_PESSOA" ? " (por outra pessoa)" : ""} — ${cpaData(p.criadoEm)}
      ${cpaSelo("cal-st-deferido", p.situacao || "Recebido")}
      ${p.texto ? `<p class="cpa-texto">${escaparHtmlEbd(p.texto)}</p>` : ""}
    </li>`).join("")}</ul>` : ""}
    ${visitas.length ? `<h5>🏠 Pedidos de visita</h5><ul class="cpa-meus-pedidos">${visitas.map(v => `<li>
      <strong>${escaparHtmlEbd(v.tipoRotulo)}</strong> — ${cpaData(v.criadoEm)} ${cpaSelo(v.encerradoEm ? "cal-st-homologado" : "cal-st-deferido", v.situacao || "")}
    </li>`).join("")}</ul>` : ""}`;
}
async function cpaCarregarBoletimMeu() {
  const seq = ++cpaSeqBolMeu;
  const data = await cpaObter("boletim-meu");
  if (seq !== cpaSeqBolMeu) return;
  const cx = cpaEl("cpaBoletimMeu");
  if (!cx) return;
  if (data.sucesso === false || !Array.isArray(data.linhas)) { cx.textContent = cpaMsgErro(data); return; }
  cx.innerHTML = cpaHtmlBoletim(data.linhas, false);
}

registrarAcoes({
  cpaAbrirDesmarcarAcao, cpaAbrirDetalheAcao, cpaAbrirFormAcao, cpaAbrirFormNovoAcao, cpaAbrirFormRegistrarPedidoAcao, cpaAbrirNotaAcao, cpaAbrirPublicarAcao, cpaAcompanharPedidoAcao,
  cpaBuscarAcao, cpaCarregarBoletimAcao, cpaCarregarFilaAcao, cpaCarregarMeuPainelAcao, cpaCarregarMeusPedidosAcao, cpaCarregarPainelAcao, cpaCarregarPedidosAcao, cpaContarNotaAcao,
  cpaContarPedidoAcao, cpaEnviarAdiarAcao, cpaEnviarCancelarAcao, cpaEnviarConcluirAcao, cpaEnviarContatoAcao, cpaEnviarDesmarcarAcao, cpaEnviarNotaAcao, cpaEnviarNovoAcao,
  cpaEnviarOracaoAcao, cpaEnviarPublicarAcao, cpaEnviarRegistrarPedidoAcao, cpaEnviarVisitaAcao, cpaEscolherPessoaAcao, cpaFecharDetalheAcao, cpaFecharFormAcao, cpaFecharFormPedidoAcao,
  cpaFecharNotaAcao, cpaFecharNovoAcao, cpaFecharRegistrarPedidoAcao, cpaImprimirBoletimAcao, cpaLeiturasAcao, cpaMarcarLidoAcao, cpaMarcarRiscoAcao, cpaMostrarPedidosAcao,
  cpaMostrarSecaoAcao, cpaMudouCadastroNovoAcao, cpaMudouCadastroRegAcao, cpaMudouCongNovoAcao, cpaMudouCongRegAcao, cpaMudouFormaAcao, cpaMudouTipoNovoAcao, cpaRecarregarNotasAcao,
  cpaVerItemAcao
});
