// app/modulos/protecao.js — v7.8: Incidentes, notificação obrigatória e escuta protegida (ECA arts. 13 e 245; Lei 13.431/2017; Regimento Art. 133 §5º; LGPD arts. 11 e 14).
// Script clássico, carregado pelo index.html DEPOIS do script.js e do eventos.js: compartilha o escopo global com eles. As ações que o HTML pede deste módulo são
// registradas aqui mesmo, no fim do arquivo (registrarAcoes mescla). Todos os nomes de nível superior começam com "prt"/"PRT_" (scripts clássicos dividem um só escopo).
//
// Três telas sobre duas rotas do servidor (GestaoProtecaoMenores: /api/protecao-menores/*; ProtecaoAjuda: /api/protecao-ajuda, SEM login), prefixo "prt":
//   1) PÚBLICO — "Preciso de ajuda" (tela de entrada, sem login): o canal de ajuda da criança e do adolescente. Só o texto é obrigatório; nada é perguntado para "provar"; o que
//      a pessoa escreve NUNCA vai para localStorage/sessionStorage e some do campo depois de enviado (ou ao sair da tela). A chamada é pública: não leva token.
//   2) Meu Painel → Proteção de crianças (qualquer login, inclusive PIN): o mesmo canal de ajuda, o registro de um incidente (voluntários e líderes) e "Meus registros";
//   3) aba "Proteção de Crianças" (permissão protecao_menores): a fila de incidentes com o relógio regressivo das 24 horas, o detalhe, a leitura protegida do relato (cada
//      leitura fica registrada), a comunicação ao órgão, o adendo, a reclassificação e, só no nível geral, a decisão do afastamento cautelar, o encerramento, os padrões, o
//      Comitê e o relatório anual.
// Toda regra (níveis, prazos, quem vê o quê, o que fecha um caso) mora no servidor (shared/protecaoMenores.js e shared/protecaoDb.js): aqui só se monta o que ele devolve e se
// manda o que a pessoa fez. Recusa de regra vem como 422 { mensagem } e é mostrada tal qual, sem limpar o formulário. PRIVACIDADE: o relato de uma criança só entra na tela
// por textContent (nunca innerHTML) e é apagado da tela ao fechar, ao trocar de incidente, ao sair da aba e ao trocar de login; a pessoa envolvida nunca vê o incidente (o
// servidor responde 404 igual a "não existe" e a tela só diz que não foi possível abrir). Tudo que vem do servidor e entra em innerHTML passa por escaparHtmlEbd; as ações do
// HTML recebem só id numérico ou constante nossa (data-args por argsAttr). Os atos sensíveis (ler o relato, decidir o afastamento, encerrar) pedem a confirmação reforçada
// da vD.4 (428): o fetchProtegido já a trata e repete a chamada uma vez.
const PRT_ROTA = "protecao-menores";
const PRT_SECOES = ["incidentes", "padroes", "comite", "relatorio"];
const PRT_CTX_AJUDA = ["Pub", "Log"];                       // as duas telas do canal de ajuda (só estas constantes entram em id)
const PRT_MS_HORA = 3600000;
const PRT_LIMITE_ATENCAO_HORAS = 12, PRT_LIMITE_CRITICO_HORAS = 4;    // as mesmas faixas do servidor (shared/protecaoMenores.js → relogio)
const PRT_INTERVALO_RELOGIO_MS = 30000;
const PRT_MAX_HORAS_CIENCIA = 24 * 30;                      // "a Igreja soube há..." até 30 dias atrás (o servidor recusa mais)
const PRT_MSG_FATOR = "Este ato precisa de uma confirmação recente de quem você é (chave de acesso ou código por e-mail). Tente de novo e confirme quando a tela pedir.";
const PRT_MSG_NAO_ABRIU = "Não foi possível abrir este incidente. Ele pode não existir ou estar fora do seu alcance.";
const PRT_MSG_AJUDA_FALHA = "Não conseguimos enviar a sua mensagem agora. Ela NÃO foi enviada. Se existe perigo agora, ligue 190. Para contar que uma criança ou adolescente está sofrendo violência, ligue 100 (de graça, a qualquer hora).";
// os mesmos telefones do servidor (api/shared/protecaoMenores.js): só aparecem se a resposta do servidor não os trouxer (rede caída, resposta que não é JSON)
const PRT_CONTATOS_PADRAO = [
  { nome: "Disque 100", numero: "100", descricao: "Gratuito, 24 horas, todos os dias. Para contar que uma criança ou adolescente está sofrendo violência." },
  { nome: "Polícia", numero: "190", descricao: "Se existe perigo agora." },
  { nome: "Conselho Tutelar", numero: null, descricao: "Existe um em cada cidade. Pergunte na prefeitura ou procure o mais perto de você." }
];
// o relógio: cor, ícone e classe por faixa (o ícone e o texto dizem o mesmo que a cor: ninguém depende só da cor)
const PRT_CLASSE_FAIXA = { NORMAL: "cal-st-homologado", ATENCAO: "cal-st-proposto", CRITICO: "cal-st-indeferido", VENCIDO: "cal-st-indeferido prt-relogio-vencido" };
const PRT_ICONE_FAIXA = { NORMAL: "⏳", ATENCAO: "⚠️", CRITICO: "🚨", VENCIDO: "⛔" };
const PRT_CLASSE_NIVEL = { QUASE_ACIDENTE: "cal-st-deferido", QUEBRA_POLITICA: "cal-st-proposto", ALEGACAO: "cal-st-indeferido" };
const PRT_ROTULO_QUEM_SOU = [
  { codigo: "CRIANCA_ADOLESCENTE", rotulo: "Sou criança ou adolescente" },
  { codigo: "RESPONSAVEL", rotulo: "Sou pai, mãe ou responsável" },
  { codigo: "OUTRA_PESSOA", rotulo: "Sou outra pessoa" }
];
// o que cada formulário da ficha do incidente guarda: campo → [contador, mínimo, máximo] (o servidor confere de novo; aqui só se avisa antes)
const PRT_CONTADORES = {
  prtRegDescricao: ["prtRegDescContador", 10, 1000], prtRegRelato: ["prtRegRelatoContador", 10, 4000],
  prtFcObs: ["prtFcObsContador", 0, 300], prtFaTexto: ["prtFaContador", 10, 2000],
  prtFrMotivo: ["prtFrMotivoContador", 10, 300], prtFrRelato: ["prtFrRelatoContador", 10, 4000],
  prtFdObs: ["prtFdContador", 10, 300], prtFeProvidencia: ["prtFeContador", 10, 500]
};
const PRT_FORMS = ["comunicacao", "adendo", "reclassificar", "decidir", "encerrar", "vincular"];
const PRT_RESULTADO_SEM_CONTEUDO = "SEM_CONTEUDO_DE_PROTECAO";   // arquivar um pedido do canal de ajuda que não tem relato de violência (teste, engano): só quando o servidor oferece (acoes.arquivarSemConteudo)

let prtDonoDaTela = null;            // matrícula + tipo de sessão de quem a tela foi montada (não vaza dado ao trocar de login)
let prtCatalogos = null;             // GET protecao-menores/catalogos (níveis, órgãos, formas, roteiro da escuta, papéis de quem está logado)
let prtCongregacoes = null;          // GET congregacoes-publico (públicas, sem login): só guarda se veio alguma
let prtSecaoAtual = "incidentes";
let prtIncidentes = [];              // GET incidentes (na ordem que o servidor mandou)
let prtDetalhe = null;               // GET incidente (o que a ficha aberta mostra; nunca guarda o relato)
let prtDeslocamento = 0;             // relógio do servidor − relógio do aparelho, em ms (o relógio regressivo usa o do servidor)
let prtRelogiosLista = [];           // [{ id, prazoMs }] dos cartões da fila
let prtRelogioDetalhe = null;        // { id, prazoMs } da ficha aberta
let prtTimer = null;                 // setInterval do relógio: só existe com a aba aberta
let prtGeracao = 0;                  // sobe a cada limpeza da tela (troca de login, saída): um pedido que ia gravar de outra "geração" não mexe na tela de agora
let prtSeqMeu = 0, prtSeqLista = 0, prtSeqDetalhe = 0, prtSeqRelato = 0, prtSeqPadroes = 0, prtSeqComite = 0, prtSeqRel = 0, prtSeqEquipes = 0;
const prtEmCurso = new Set();        // trava duplo clique nas ações que gravam

// A aba abre para quem tem a permissão da proteção; cada seção só aparece para quem o SERVIDOR diz que pode (o catálogo traz os papéis da sessão).
function prtPodeAba() { return authPermissoes.includes("protecao_menores"); }
function prtEhGestao() { return prtCatalogos ? prtCatalogos.papeis.gestao : false; }
function prtEhGeral() { return !!(prtCatalogos && prtCatalogos.papeis.geral); }

// ---- utilidades ----
function prtEl(id) { return document.getElementById(id); }
function prtTexto(id) { const c = prtEl(id); return c ? String(c.value == null ? "" : c.value).trim() : ""; }
// identificador digitado: inteiro maior que zero, ou 0
function prtInteiro(texto) { const n = Number(texto); return Number.isInteger(n) && n >= 1 ? n : 0; }
function prtMsgErro(data) { return (data && data.mensagem) || "Não foi possível concluir a operação agora."; }
function prtTemMarca(texto) { return /[<>]/.test(texto); }
function prtTem(mapa, chave) { return !!mapa && Object.prototype.hasOwnProperty.call(mapa, chave); }
// mnr-selo/prt-selo: o rótulo vem do servidor e pode ser longo; no celular ele quebra a linha em vez de estourar o cartão
function prtSelo(classe, rotulo) { return `<span class="cal-selo prt-selo ${classe}">${escaparHtmlEbd(rotulo)}</span>`; }
function prtCampo(rotulo, html) { return html ? `<div><dt>${rotulo}</dt><dd>${html}</dd></div>` : ""; }
function prtData(valor) { return escaparHtmlEbd(calData(valor)); }
function prtDataHora(valor) { return escaparHtmlEbd(calDataHora(valor)); }
function prtOpcoes(lista, valor, rotulo, placeholder) {
  return (placeholder != null ? `<option value="">${escaparHtmlEbd(placeholder)}</option>` : "")
    + lista.map(x => `<option value="${escaparHtmlEbd(valor(x))}">${escaparHtmlEbd(rotulo(x))}</option>`).join("");
}
function prtPreencherSelect(id, lista, valor, rotulo, placeholder) {
  const sel = prtEl(id);
  if (!sel) return;
  const atual = sel.value;
  sel.innerHTML = prtOpcoes(lista, valor, rotulo, placeholder);
  if (atual && Array.from(sel.options).some(o => o.value === atual)) sel.value = atual;
}
function prtRolarPara(id) {
  const el = prtEl(id);
  if (el && typeof el.scrollIntoView === "function") el.scrollIntoView({ behavior: "smooth", block: "start" });
}
function prtEscreverAviso(id, texto, destaque) {
  const el = prtEl(id);
  if (el) { el.textContent = texto; el.className = destaque ? "subtitle psc-aviso" : "subtitle"; }
}
async function prtProtegerBotao(botao, tarefa, chave) {
  if (chave) {
    if (prtEmCurso.has(chave)) { mostrarToast("Aguarde: o pedido anterior ainda está sendo processado.", "erro"); return undefined; }
    prtEmCurso.add(chave);
  }
  if (botao) botao.disabled = true;
  try { return await tarefa(); } finally {
    if (botao) botao.disabled = false;
    if (chave) prtEmCurso.delete(chave);
  }
}
function prtRotuloDe(lista, codigo) {
  const achado = lista.find(x => x && x.codigo === codigo);
  return achado ? String(achado.rotulo) : String(codigo);
}
function prtRotuloNivel(codigo) { return prtCatalogos ? prtRotuloDe(prtCatalogos.niveis, codigo) : String(codigo); }
function prtClasseNivel(codigo) { return prtTem(PRT_CLASSE_NIVEL, codigo) ? PRT_CLASSE_NIVEL[codigo] : "cal-st-cancelado"; }
// os dias de um instante AAAA-MM-DD... ou a data completa de um instante com hora
function prtAgoraLocalInput() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

// ---- chamadas à API (nunca lançam: erro de rede ou resposta que não é JSON viram { sucesso:false, mensagem }) ----
async function prtRequisitar(rota, caminho, opcoes) {
  try {
    const res = await fetchProtegido(`${API_BASE}/${rota}/${caminho}`, opcoes);
    let corpo = null;
    try { corpo = await res.json(); } catch { /* sem JSON */ }
    if (!corpo || typeof corpo !== "object" || Array.isArray(corpo)) return { sucesso: false, mensagem: `Resposta inesperada do servidor (${res.status}).`, httpStatus: res.status };
    if (res.status >= 400) corpo.sucesso = false;
    // 428: a confirmação reforçada (chave de acesso ou código por e-mail) não foi concluída; o fetchProtegido já tentou uma vez
    if (res.status === 428 || corpo.precisaFator) corpo.mensagem = PRT_MSG_FATOR;
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
function prtObter(caminho) { return prtRequisitar(PRT_ROTA, caminho); }
function prtPostar(caminho, corpo) {
  return prtRequisitar(PRT_ROTA, caminho, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo) });
}
// O canal de ajuda é PÚBLICO: a criança pode não ter conta. Chamada comum, sem token e sem nenhum cabeçalho de sessão (nunca fetchProtegido). Nunca lança.
async function prtPostarAjuda(corpo) {
  try {
    const res = await fetch(`${API_BASE}/protecao-ajuda`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo) });
    let dados = null;
    try { dados = await res.json(); } catch { /* resposta que não é JSON (página de erro do servidor) */ }
    if (!dados || typeof dados !== "object" || Array.isArray(dados)) return { sucesso: false, httpStatus: res.status, mensagem: PRT_MSG_AJUDA_FALHA };
    dados.httpStatus = res.status;
    if (res.status >= 400) dados.sucesso = false;
    return dados;
  } catch (e) {
    return { sucesso: false, falhaDeRede: true, mensagem: PRT_MSG_AJUDA_FALHA };
  }
}
// Toast + texto fixo na tela (textContent: nada de HTML aqui). Quando o fetchProtegido já avisou (rede, sessão, 403, 5xx), só o texto vai para a tela.
function prtMostrarResultado(data, idMensagem, destaque) {
  const texto = prtMsgErro(data);
  if (!(data && data.jaAvisado)) mostrarToast(texto, data && data.sucesso === false ? "erro" : "sucesso");
  prtEscreverAviso(idMensagem, texto, destaque || !!(data && data.sucesso === false));
}

async function prtGarantirCatalogos(forcar) {
  if (prtCatalogos && !forcar) return prtCatalogos;
  const dono = prtDonoDaTela;
  const data = await prtObter("catalogos");
  if (dono !== prtDonoDaTela) return prtCatalogos;   // a pessoa trocou de login enquanto o catálogo vinha: o dela é outro (a tela é refeita no próximo carregamento)
  if (data.sucesso === false) { prtCatalogos = null; return null; }
  const lista = (v) => (Array.isArray(v) ? v.filter(x => x && typeof x === "object") : []);
  const papeis = data.papeis && typeof data.papeis === "object" ? data.papeis : {};
  prtCatalogos = {
    niveis: lista(data.niveis), orgaos: lista(data.orgaos), formas: lista(data.formas), quemRelatou: lista(data.quemRelatou), resultados: lista(data.resultados),
    decisoes: lista(data.decisoes), contatosDeAjuda: lista(data.contatosDeAjuda), roteiroEscuta: lista(data.roteiroEscuta),
    naoFaca: Array.isArray(data.naoFaca) ? data.naoFaca.map(x => String(x)) : [], horasPrazo: Number(data.horasPrazo) || 24,
    papeis: { gestao: !!papeis.gestao, geral: !!papeis.geral }
  };
  return prtCatalogos;
}
// As congregações PÚBLICAS (sem login, a mesma lista do site): servem ao canal de ajuda e ao registro de incidente. Só guarda a lista se ela veio (falha não vira "nenhuma").
async function prtGarantirCongregacoes() {
  if (prtCongregacoes) return prtCongregacoes;
  let itens = [];
  try {
    const res = await fetch(`${API_BASE}/congregacoes-publico`);
    const lista = res.ok ? await res.json() : [];
    itens = Array.isArray(lista) ? lista.filter(c => c && typeof c === "object" && prtInteiro(c.congregacaoId) && typeof c.nome === "string") : [];
  } catch { return []; }
  if (itens.length) prtCongregacoes = itens;
  return itens;
}

// ---- troca de login: não deixa o dado da pessoa anterior na tela ----
const PRT_IDS_LISTAS = ["prtAjudaLogForm", "prtAjudaPubForm", "prtRegNiveis", "prtRegResposta", "prtMeusLista", "prtListaIncidentes", "prtDetalheConteudo", "prtPadroesLista", "prtComiteLista", "prtRelImprimivel"];
const PRT_IDS_MENSAGENS = ["prtMeuResultado", "prtRegMsg", "prtMeusMsg", "prtListaResultado", "prtDetalheMsg", "prtPadroesResultado", "prtComiteResultado", "prtRelResultado"];
const PRT_IDS_CAMPOS = ["prtRegOnde", "prtRegDescricao", "prtRegEnvMatricula", "prtRegEnvNome", "prtRegRelato", "prtRegHoras", "prtRegData"];
const PRT_IDS_SELECTS = ["prtRegCong", "prtRegEquipe", "prtRegQuem", "prtRelAno"];
const PRT_IDS_BLOCOS = ["prtRegCx", "prtRegAlegacaoCx", "prtRegEquipeCx", "prtDetalheCx", "prtSemAcesso"];
const PRT_IDS_CONTADORES = ["prtRegDescContador", "prtRegRelatoContador"];
function prtLimparTela() {
  prtGeracao++;
  prtCatalogos = null; prtSecaoAtual = "incidentes"; prtIncidentes = []; prtDetalhe = null; prtDeslocamento = 0; prtRelogiosLista = []; prtRelogioDetalhe = null;
  prtPararRelogio();
  // pedidos que ainda estão a caminho trazem dado do login anterior: a resposta velha é descartada
  prtSeqMeu++; prtSeqLista++; prtSeqDetalhe++; prtSeqRelato++; prtSeqPadroes++; prtSeqComite++; prtSeqRel++; prtSeqEquipes++;
  PRT_IDS_LISTAS.forEach(id => { const el = prtEl(id); if (el) el.innerHTML = ""; });
  // a classe volta ao normal: uma mensagem em destaque (psc-aviso) esvaziada apareceria como uma caixa amarela vazia
  PRT_IDS_MENSAGENS.forEach(id => { const el = prtEl(id); if (el) { el.textContent = ""; el.className = String(el.className || "").replace(/\bpsc-aviso\b/g, "").replace(/\bpsc-alerta\b/g, "").replace(/\s+/g, " ").trim(); } });
  PRT_IDS_CAMPOS.forEach(id => { const el = prtEl(id); if (el) el.value = ""; });
  PRT_IDS_SELECTS.forEach(id => { const el = prtEl(id); if (el) el.innerHTML = ""; });
  PRT_IDS_CONTADORES.forEach(id => { const el = prtEl(id); if (el) el.textContent = "0"; });
  PRT_IDS_BLOCOS.forEach(id => { const el = prtEl(id); if (el) el.style.display = "none"; });
  const lista = prtEl("prtListaCx"), filtro = prtEl("prtFiltroStatus");
  if (lista) lista.style.display = "";
  if (filtro) filtro.value = "ABERTO";
  const impressao = document.body && document.body.classList;
  if (impressao) impressao.remove("prt-imprimindo");
  prtAplicarPermissoes();   // sem isto as pílulas do nível geral ficavam visíveis para quem entrou depois
}
// De quem é a tela: a matrícula E o tipo de sessão (senha de liderança × PIN). O mesmo líder que entra por PIN e depois por senha tem outros papéis (o catálogo traz
// `papeis` por sessão), então a tela é refeita.
function prtChaveDoDono() { return `${authMatricula}|${sessaoDeLiderancaNaTela() ? "senha" : "pin"}`; }
function prtVerificarDono() {
  if (prtDonoDaTela !== prtChaveDoDono()) { prtLimparTela(); prtDonoDaTela = prtChaveDoDono(); }
}

// ============================================================================
// O RELÓGIO DAS 24 HORAS (a regra está no servidor; aqui só se refaz a conta no aparelho a cada 30 s, com o relógio do SERVIDOR como referência)
// ============================================================================
function prtAgoraServidor() { return Date.now() + prtDeslocamento; }
// { faixa, texto } — as mesmas faixas e o mesmo texto de shared/protecaoMenores.js (relogio): "faltam 3 h 20 min", "vencido há 2 h 05 min"
function prtRelogioDe(prazoMs, agoraMs) {
  const restante = prazoMs - agoraMs;
  const vencido = restante <= 0;
  const abs = Math.abs(restante);
  const h = Math.floor(abs / PRT_MS_HORA), m = Math.floor((abs % PRT_MS_HORA) / 60000);
  const faixa = vencido ? "VENCIDO" : restante <= PRT_LIMITE_CRITICO_HORAS * PRT_MS_HORA ? "CRITICO" : restante <= PRT_LIMITE_ATENCAO_HORAS * PRT_MS_HORA ? "ATENCAO" : "NORMAL";
  const duracao = h > 0 ? `${h} h ${String(m).padStart(2, "0")} min` : `${m} min`;
  return { faixa, texto: vencido ? `vencido há ${duracao}` : `faltam ${duracao}` };
}
function prtClasseFaixa(faixa) { return prtTem(PRT_CLASSE_FAIXA, faixa) ? PRT_CLASSE_FAIXA[faixa] : "cal-st-cancelado"; }
function prtTextoRelogio(r) { return `${prtTem(PRT_ICONE_FAIXA, r.faixa) ? PRT_ICONE_FAIXA[r.faixa] : "⏳"} ${r.texto}`; }
// O selo do relógio: `domId` é o id do elemento (o tique de 30 s o reescreve); `prazoEm` vem do servidor.
function prtHtmlRelogio(domId, prazoEm) {
  const prazoMs = Date.parse(prazoEm);
  if (!Number.isFinite(prazoMs)) return "";
  const r = prtRelogioDe(prazoMs, prtAgoraServidor());
  return `<span id="${domId}" role="timer" class="cal-selo prt-selo prt-relogio ${prtClasseFaixa(r.faixa)}">${escaparHtmlEbd(prtTextoRelogio(r))}</span>`;
}
function prtAtualizarRelogios() {
  const agora = prtAgoraServidor();
  const todos = prtRelogioDetalhe ? [...prtRelogiosLista, prtRelogioDetalhe] : prtRelogiosLista;
  todos.forEach(item => {
    const el = prtEl(item.id);
    if (!el) return;
    const r = prtRelogioDe(item.prazoMs, agora);
    el.textContent = prtTextoRelogio(r);
    el.className = `cal-selo prt-selo prt-relogio ${prtClasseFaixa(r.faixa)}`;
  });
}
// a tela está viva: há sessão, é a mesma pessoa que abriu e a aba continua aberta
function prtTelaViva() {
  const aba = prtEl("abaProtecao");
  return !!(authToken && prtDonoDaTela === prtChaveDoDono() && aba && aba.style.display === "block");
}
function prtTique() {
  if (!prtTelaViva()) { prtPararRelogio(); return; }
  prtAtualizarRelogios();
}
function prtIniciarRelogio() { if (prtTimer == null) prtTimer = setInterval(prtTique, PRT_INTERVALO_RELOGIO_MS); }
function prtPararRelogio() { if (prtTimer != null) { clearInterval(prtTimer); prtTimer = null; } }
// o intervalo só roda enquanto há relógio na tela e a aba está aberta
function prtAjustarRelogio() {
  if (prtRelogiosLista.length || prtRelogioDetalhe) prtIniciarRelogio(); else prtPararRelogio();
}
function prtAcertarRelogio(agora) {
  const ms = Date.parse(agora);
  prtDeslocamento = Number.isFinite(ms) ? ms - Date.now() : 0;
}

// ============================================================================
// 1) PÚBLICO E MEU PAINEL — "PRECISO DE AJUDA" (o canal de ajuda; sem login, sem prova, sem culpa)
// ============================================================================
function prtCtxAjuda(bruto) { return bruto === "Log" ? "Log" : "Pub"; }   // só as duas constantes nossas entram em id e argumento
function prtHtmlContatos(lista) {
  const itens = Array.isArray(lista) && lista.length ? lista : PRT_CONTATOS_PADRAO;
  return `<ul class="prt-contatos-lista">${itens.map(c => {
    const digitos = String(c && c.numero != null ? c.numero : "").replace(/\D/g, "").slice(0, 8);
    const nome = escaparHtmlEbd(c && c.nome);
    const descricao = escaparHtmlEbd(c && c.descricao);
    return digitos
      ? `<li><a class="prt-tel" href="${urlSegura(`tel:${digitos}`)}">📞 ${nome}: <strong>${escaparHtmlEbd(digitos)}</strong></a><span class="prt-tel-desc">${descricao}</span></li>`
      : `<li><strong>${nome}</strong><span class="prt-tel-desc">${descricao}</span></li>`;
  }).join("")}</ul>`;
}
// O formulário é um só para as duas telas (a pública, sem login, e a de Meu Painel); `ctx` é "Pub" ou "Log". Nada é perguntado para "provar": só o texto é obrigatório.
function prtMontarFormAjuda(ctxBruto) {
  const ctx = prtCtxAjuda(ctxBruto);
  const cx = prtEl(`prtAjuda${ctx}Form`);
  if (!cx || cx.innerHTML !== "") return;   // já montado: não apaga o que a pessoa está escrevendo
  cx.innerHTML = `<div class="prt-ajuda-form">
    <div class="input-group">
      <label for="prtAjuda${ctx}Texto">Conte o que aconteceu, com as suas palavras</label>
      <textarea id="prtAjuda${ctx}Texto" rows="6" maxlength="4000" autocomplete="off" placeholder="Pode escrever do seu jeito. Não existe resposta certa nem errada."></textarea>
      <p class="psc-legenda">Você não precisa dizer o seu nome. Escreva só o que quiser contar.</p>
    </div>
    <div class="input-group">
      <label for="prtAjuda${ctx}Quem">Quem está escrevendo? (se quiser dizer)</label>
      <select id="prtAjuda${ctx}Quem">${prtOpcoes(PRT_ROTULO_QUEM_SOU, x => x.codigo, x => x.rotulo, "Prefiro não dizer")}</select>
    </div>
    <div class="input-group">
      <label for="prtAjuda${ctx}Contato">Como falar com você (opcional)</label>
      <input type="text" id="prtAjuda${ctx}Contato" maxlength="150" autocomplete="off" placeholder="Telefone, WhatsApp ou e-mail, se você quiser" />
    </div>
    <div class="input-group">
      <label for="prtAjuda${ctx}Cong">Qual igreja? (opcional)</label>
      <select id="prtAjuda${ctx}Cong"><option value="">Não sei ou prefiro não dizer</option></select>
    </div>
    <div class="psc-acoes">
      <button type="button" class="btn-confirmar prt-btn-enviar" id="prtAjuda${ctx}Botao" data-on-click="prtEnviarAjudaAcao" data-args-click="${argsAttr(ctx, ARG.elemento)}">💛 Enviar</button>
    </div>
    <div id="prtAjuda${ctx}Resultado" class="prt-ajuda-resultado" role="status" aria-live="polite"></div>
  </div>`;
  prtPreencherCongAjuda();
}
function prtPreencherCongAjuda() {
  const lista = prtCongregacoes || [];
  PRT_CTX_AJUDA.forEach(ctx => {
    const sel = prtEl(`prtAjuda${ctx}Cong`);
    if (!sel) return;
    const atual = sel.value;
    sel.innerHTML = prtOpcoes(lista, c => String(Number(c.congregacaoId)), c => c.nome, "Não sei ou prefiro não dizer");
    if (atual && Array.from(sel.options).some(o => o.value === atual)) sel.value = atual;
  });
}
// o que a criança escreveu nunca fica no aparelho: ao enviar com sucesso, ao sair da tela e ao trocar de login o campo é esvaziado (nada vai para localStorage/sessionStorage)
function prtLimparCamposAjuda(ctx) {
  [`prtAjuda${ctx}Texto`, `prtAjuda${ctx}Contato`].forEach(id => { const el = prtEl(id); if (el) el.value = ""; });
  const quem = prtEl(`prtAjuda${ctx}Quem`), cong = prtEl(`prtAjuda${ctx}Cong`);
  if (quem) quem.value = "";
  if (cong) cong.value = "";
}
function prtEscreverAjuda(ctx, texto) {
  const el = prtEl(`prtAjuda${ctx}Resultado`);
  if (el) { el.textContent = texto; el.className = "prt-ajuda-resultado prt-ajuda-aviso"; }
}
// Mensagem que a pessoa lê antes de enviar (texto simples e sem culpa); o servidor confere de novo.
function prtValidarAjuda(texto, contato) {
  if (texto.length < 10) return "Conte um pouco mais, com pelo menos 10 letras, para a pessoa que vai ler conseguir entender.";
  if (texto.length > 4000) return "O texto ficou muito grande (o máximo é 4000 letras). Você pode mandar em duas partes.";
  if (prtTemMarca(texto) || prtTemMarca(contato)) return "Não dá para usar os sinais < e >. Troque por outras palavras.";
  if (contato.length > 150) return "Como falar com você: use no máximo 150 letras.";
  return "";
}
function prtMostrarFalhaAjuda(ctx, data) {
  const el = prtEl(`prtAjuda${ctx}Resultado`);
  if (!el) return;
  el.className = "prt-ajuda-resultado prt-ajuda-aviso";
  el.innerHTML = `<p>${escaparHtmlEbd(prtMsgErro(data))}</p>
    <p class="psc-legenda">Se precisar, estes telefones atendem de graça:</p>${prtHtmlContatos(data.contatosDeAjuda)}`;
}
function prtMostrarSucessoAjuda(ctx, data) {
  const el = prtEl(`prtAjuda${ctx}Resultado`);
  if (!el) return;
  el.className = "prt-ajuda-resultado prt-ajuda-ok";
  el.innerHTML = `<h4>💛 Recebemos o que você contou</h4>
    <p>${escaparHtmlEbd(prtMsgErro(data))}</p>
    ${data.protocolo ? `<p>Número do seu pedido: <strong>${escaparHtmlEbd(data.protocolo)}</strong>. Anote, se quiser. Não é obrigatório.</p>` : ""}
    <p class="psc-legenda">Se precisar falar com alguém agora, estes telefones atendem de graça:</p>${prtHtmlContatos(data.contatosDeAjuda)}`;
}
async function prtEnviarAjudaAcao(ctxBruto, botao) {
  const ctx = prtCtxAjuda(ctxBruto);
  const texto = prtTexto(`prtAjuda${ctx}Texto`), contato = prtTexto(`prtAjuda${ctx}Contato`);
  const quemSou = prtTexto(`prtAjuda${ctx}Quem`), congregacaoId = prtInteiro(prtTexto(`prtAjuda${ctx}Cong`));
  const problema = prtValidarAjuda(texto, contato);
  if (problema) { prtEscreverAjuda(ctx, problema); return; }
  const corpo = { texto };
  if (quemSou) corpo.quemSou = quemSou;
  if (contato) corpo.contato = contato;
  if (congregacaoId) corpo.congregacaoId = congregacaoId;
  await prtProtegerBotao(botao, async () => {
    const el = prtEl(`prtAjuda${ctx}Resultado`);
    if (el) { el.textContent = "Enviando…"; el.className = "prt-ajuda-resultado"; }
    const data = await prtPostarAjuda(corpo);
    // não deu certo (regra, limite ou erro): o que a pessoa escreveu FICA no campo, e o servidor diz o que fazer (100 e 190 sempre à vista)
    if (data.sucesso !== true) { prtMostrarFalhaAjuda(ctx, data); return; }
    prtLimparCamposAjuda(ctx);
    prtMostrarSucessoAjuda(ctx, data);
  }, `ajuda${ctx}`);
}
// A tela pública: abre a partir da tela de entrada (sem login).
async function prtAbrirAjudaPublicaAcao() {
  esconderTodasAsTelas();
  const tela = prtEl("prtTelaAjuda");
  if (tela) tela.style.display = "flex";
  prtMontarFormAjuda("Pub");
  await prtGarantirCongregacoes();
  prtPreencherCongAjuda();
}
function prtFecharAjudaPublicaAcao() {
  // o que foi escrito e não enviado não fica no aparelho (pode ser um computador de uso comum): o formulário é desmontado
  const cx = prtEl("prtAjudaPubForm");
  if (cx) cx.innerHTML = "";
  const tela = prtEl("prtTelaAjuda");
  if (tela) tela.style.display = "none";
  if (authToken && authMatricula) mostrarTelaPainelInicial(); else voltarParaCheckin();
}

// ============================================================================
// 2) MEU PAINEL → PROTEÇÃO DE CRIANÇAS (qualquer login): registrar um incidente e meus registros
// ============================================================================
async function carregarMeuPainelProtecaoAcao() {
  prtVerificarDono();
  const aviso = prtEl("prtMeuResultado");
  if (!aviso) return;
  prtMontarFormAjuda("Log");
  if (!authToken) {
    prtLimparTela();
    aviso.textContent = "Entre com a sua matrícula e o seu PIN (ou senha) para registrar um incidente. O pedido de ajuda acima funciona sem entrar.";
    return;
  }
  const seq = ++prtSeqMeu;
  aviso.textContent = "Carregando…";
  const [catalogo, meus, congregacoes] = await Promise.all([prtGarantirCatalogos(true), prtObter("meus"), prtGarantirCongregacoes()]);
  if (seq !== prtSeqMeu) return;   // resposta velha: a pessoa trocou de login ou recarregou
  aviso.textContent = "";
  prtPreencherCongAjuda();
  const cx = prtEl("prtRegCx");
  if (!catalogo) {
    if (cx) cx.style.display = "none";
    aviso.textContent = "Não foi possível carregar o formulário de registro agora. Abra esta tela de novo para tentar outra vez.";
    aviso.className = "subtitle psc-aviso";
  } else {
    aviso.className = "subtitle";
    prtPrepararFormRegistro(congregacoes);
  }
  prtAplicarMeus(meus);
}
// O formulário de registro: níveis do catálogo (com a descrição de cada um), congregações, "quem contou" e o roteiro da escuta.
function prtPrepararFormRegistro(congregacoes) {
  const cat = prtCatalogos;
  const cx = prtEl("prtRegCx");
  if (!cat || !cx) return;
  cx.style.display = "";
  const niveis = prtEl("prtRegNiveis");
  if (niveis && niveis.innerHTML === "") {
    niveis.innerHTML = cat.niveis.map((n, i) => `<label class="prt-nivel" for="prtRegNivel${i}">
        <input type="radio" name="prtRegNivel" id="prtRegNivel${i}" value="${escaparHtmlEbd(n.codigo)}" data-on-change="prtMudouNivelAcao" />
        <span><strong>${escaparHtmlEbd(n.rotulo)}</strong><br /><span class="prt-nivel-desc">${escaparHtmlEbd(n.descricao || "")}</span></span>
      </label>`).join("");
  }
  prtPreencherSelect("prtRegCong", congregacoes, c => String(Number(c.congregacaoId)), c => c.nome, "— escolha a congregação —");
  prtPreencherSelect("prtRegQuem", cat.quemRelatou, x => x.codigo, x => x.rotulo, "— escolha —");
  const data = prtEl("prtRegData");
  if (data) { data.value = data.value || calHojeBrasilia(); data.setAttribute("max", calHojeBrasilia()); }
  const horas = prtEl("prtRegHoras");
  if (horas && horas.value === "") horas.value = "0";
  const roteiro = prtEl("prtRegRoteiro");
  if (roteiro) roteiro.innerHTML = prtHtmlRoteiro();
  prtMudouNivelAcao();
}
// O roteiro da escuta (acolher, registrar como foi dito, encaminhar) e o que NÃO fazer: o texto vem do catálogo do servidor.
function prtHtmlRoteiro() {
  const cat = prtCatalogos;
  if (!cat) return "";
  return `<div class="prt-roteiro" role="note">
    <strong>Como acolher (a Igreja acolhe e encaminha; quem apura são as autoridades)</strong>
    <ol class="prt-roteiro-passos">${cat.roteiroEscuta.map(p => `<li><strong>${escaparHtmlEbd(p.passo)}</strong> ${escaparHtmlEbd(p.texto)}</li>`).join("")}</ol>
    <strong class="prt-nao-faca">NÃO FAÇA</strong>
    <ul class="prt-nao-faca-lista">${cat.naoFaca.map(t => `<li>${escaparHtmlEbd(t)}</li>`).join("")}</ul>
  </div>`;
}
// o nível escolhido (índice numérico no id: nenhum texto do servidor vira id)
function prtNivelEscolhido() {
  if (!prtCatalogos) return "";
  for (let i = 0; i < prtCatalogos.niveis.length; i++) {
    const r = prtEl(`prtRegNivel${i}`);
    if (r && r.checked) return String(prtCatalogos.niveis[i].codigo);
  }
  return "";
}
// "Suspeita ou relato de violência" pede quem contou e o relato (com o roteiro); os outros níveis, só os fatos.
function prtMudouNivelAcao() {
  const bloco = prtEl("prtRegAlegacaoCx");
  if (bloco) bloco.style.display = prtNivelEscolhido() === "ALEGACAO" ? "" : "none";
}
// A equipe é opcional: só se carrega para quem tem a permissão das escalas (o servidor recusa a quem não alcança a congregação; sem ela a pergunta some).
async function prtMudouCongregacaoAcao() {
  const cx = prtEl("prtRegEquipeCx"), sel = prtEl("prtRegEquipe");
  const congregacaoId = prtInteiro(prtTexto("prtRegCong"));
  const seq = ++prtSeqEquipes;
  if (sel) sel.innerHTML = "";
  if (cx) cx.style.display = "none";
  if (!congregacaoId || !authPermissoes.includes("escalas")) return;
  const data = await prtRequisitar("escalas", `equipes?congregacaoId=${congregacaoId}`);
  if (seq !== prtSeqEquipes) return;
  if (data.sucesso === false || !Array.isArray(data.equipes)) return;   // opcional: sem a lista, só não se pergunta
  const equipes = data.equipes.filter(e => e && e.ativa !== false && prtInteiro(e.equipeId));
  if (!equipes.length) return;
  prtPreencherSelect("prtRegEquipe", equipes, e => String(Number(e.equipeId)), e => e.nome, "— não foi numa equipe —");
  if (cx) cx.style.display = "";
}
// contador dos campos de texto (fica vermelho enquanto falta ou passa do tamanho aceito)
function prtContarAcao(idCampo) {
  if (!prtTem(PRT_CONTADORES, idCampo)) return;
  const [idContador, minimo, maximo] = PRT_CONTADORES[idCampo];
  const campo = prtEl(idCampo), contador = prtEl(idContador);
  if (!campo || !contador) return;
  const n = String(campo.value).trim().length;
  contador.textContent = String(n);
  contador.className = n > 0 && (n < minimo || n > maximo) ? "psc-alerta" : "";
}
function prtAplicarMeus(resposta) {
  const cx = prtEl("prtMeusLista");
  if (!cx) return;
  if (resposta.sucesso === false || !Array.isArray(resposta.incidentes)) {
    cx.innerHTML = `<p class="subtitle">${escaparHtmlEbd(prtMsgErro(resposta))}</p>`;
    return;
  }
  // só o que a própria pessoa registrou, e só protocolo, nível, data e situação (o relato e o andamento não voltam para ela)
  cx.innerHTML = resposta.incidentes.length
    ? resposta.incidentes.map(i => `<div class="cal-cartao cartao-area-ebd prt-meu">
        <h5>${escaparHtmlEbd(i.protocolo)} ${prtSelo("cal-st-deferido", i.nivelRotulo)} ${prtSelo(i.situacao === "Encerrado" ? "cal-st-cancelado" : "cal-st-proposto", i.situacao)}</h5>
        <p class="psc-legenda">Aconteceu em ${prtData(i.dataOcorrencia)} · registrado em ${prtDataHora(i.registradoEm)}</p>
      </div>`).join("")
    : "<p class='subtitle'>Você ainda não registrou nenhum incidente.</p>";
}
async function prtCarregarMeusAcao() {
  const seq = prtSeqMeu;
  const data = await prtObter("meus");
  if (seq !== prtSeqMeu) return;
  prtAplicarMeus(data);
}
// o que a tela confere ANTES de mandar (o servidor confere de novo); devolve a mensagem do primeiro problema, ou "".
function prtValidarRegistro(c) {
  if (!c.nivel) return "Escolha o que aconteceu: quase-acidente, quebra de política ou suspeita ou relato de violência.";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(c.data)) return "Informe a data em que aconteceu (dia, mês e ano).";
  if (c.data > calHojeBrasilia()) return "A data em que aconteceu não pode estar no futuro.";
  if (!c.congregacaoId) return "Escolha a congregação onde aconteceu.";
  if (c.onde.length > 150 || prtTemMarca(c.onde)) return "Onde aconteceu: até 150 caracteres, sem < ou >.";
  if (c.descricao.length < 10 || c.descricao.length > 1000 || prtTemMarca(c.descricao)) return "Descreva o que aconteceu em poucas palavras (de 10 a 1000 caracteres, sem < ou >). Escreva só fatos, sem opinião.";
  if (c.envMatricula && c.envNome) return "Preencha a matrícula OU o nome da pessoa envolvida, não os dois. Se souber a matrícula, preencha só ela.";
  if (c.envMatriculaTexto && !c.envMatricula) return "A matrícula da pessoa envolvida precisa ser um número.";
  if (c.envNome.length > 150 || prtTemMarca(c.envNome)) return "Nome da pessoa envolvida: até 150 caracteres, sem < ou >.";
  if (c.nivel === "ALEGACAO") {
    if (!c.quem) return "Diga quem contou ou percebeu o fato (a criança, o responsável, um voluntário ou outra pessoa).";
    if (c.relato.length < 10 || c.relato.length > 4000 || prtTemMarca(c.relato)) return "Registre o relato do jeito que foi contado, sem corrigir nem interpretar (de 10 a 4000 caracteres, sem < ou >).";
    if (!c.horasValidas) return `"A Igreja soube há quantas horas" precisa ser um número inteiro de 0 a ${PRT_MAX_HORAS_CIENCIA} (0 = agora).`;
  }
  return "";
}
function prtTextoConfirmarSuspeita(c) {
  const prazo = c.horas > 0
    ? `o prazo de 24 horas para comunicar o Conselho Tutelar já está correndo (a Igreja soube há ${c.horas} h)`
    : "o prazo de 24 horas para comunicar o Conselho Tutelar começa agora";
  const afasta = c.envMatricula ? `; a pessoa envolvida (matrícula ${c.envMatricula}), se for membro, sai das escalas com crianças por cautela (não é punição)` : "";
  return `Isto é uma suspeita ou relato de violência contra criança ou adolescente. Ao enviar: ${prazo}${afasta}; e a liderança de proteção será avisada na hora. Não converse sobre o caso com outras pessoas. Enviar?`;
}
function prtLerRegistro() {
  const horasTexto = prtTexto("prtRegHoras");
  const horas = horasTexto === "" ? 0 : Number(horasTexto);
  return {
    nivel: prtNivelEscolhido(), data: prtTexto("prtRegData"), congregacaoId: prtInteiro(prtTexto("prtRegCong")), equipeId: prtInteiro(prtTexto("prtRegEquipe")),
    onde: prtTexto("prtRegOnde"), descricao: prtTexto("prtRegDescricao"), envMatriculaTexto: prtTexto("prtRegEnvMatricula"), envMatricula: prtInteiro(prtTexto("prtRegEnvMatricula")),
    envNome: prtTexto("prtRegEnvNome"), quem: prtTexto("prtRegQuem"), relato: prtTexto("prtRegRelato"),
    horas, horasValidas: Number.isInteger(horas) && horas >= 0 && horas <= PRT_MAX_HORAS_CIENCIA
  };
}
async function prtEnviarRegistroAcao(botao) {
  const c = prtLerRegistro();
  const erro = (texto) => { mostrarToast(texto, "erro"); prtEscreverAviso("prtRegMsg", texto, true); };
  const problema = prtValidarRegistro(c);
  if (problema) { erro(problema); return; }
  if (c.nivel === "ALEGACAO" && !(await confirmarAcao(prtTextoConfirmarSuspeita(c), "Enviar a suspeita"))) return;
  const corpo = { nivel: c.nivel, dataOcorrencia: c.data, congregacaoId: c.congregacaoId, descricao: c.descricao };
  if (c.equipeId) corpo.equipeId = c.equipeId;
  if (c.onde) corpo.onde = c.onde;
  if (c.envMatricula) corpo.envolvidoMembroId = c.envMatricula;
  else if (c.envNome) corpo.envolvidoNome = c.envNome;
  if (c.nivel === "ALEGACAO") { corpo.relatadoPor = c.quem; corpo.relato = c.relato; corpo.conhecidoHaHoras = c.horas; }
  const geracao = prtGeracao;
  await prtProtegerBotao(botao, async () => {
    const data = await prtPostar("registrar", corpo);
    if (geracao !== prtGeracao) return;   // a pessoa trocou de login (ou saiu) enquanto o pedido ia
    prtMostrarResultado(data, "prtRegMsg", false);
    if (data.sucesso === false) { prtMostrarRespostaRegistro(null); return; }   // recusa de regra (inclusive o limite): mensagem do servidor e formulário intacto
    prtLimparFormRegistro();
    prtMostrarRespostaRegistro(data);
    await prtCarregarMeusAcao();
  }, "registrar");
}
// o que foi escrito (principalmente o relato) some do formulário depois de enviado
function prtLimparFormRegistro() {
  ["prtRegOnde", "prtRegDescricao", "prtRegEnvMatricula", "prtRegEnvNome", "prtRegRelato"].forEach(id => { const el = prtEl(id); if (el) el.value = ""; });
  const horas = prtEl("prtRegHoras"), quem = prtEl("prtRegQuem"), equipe = prtEl("prtRegEquipe");
  if (horas) horas.value = "0";
  if (quem) quem.value = "";
  if (equipe) equipe.value = "";
  if (prtCatalogos) prtCatalogos.niveis.forEach((n, i) => { const r = prtEl(`prtRegNivel${i}`); if (r) r.checked = false; });
  ["prtRegDescContador", "prtRegRelatoContador"].forEach(id => { const el = prtEl(id); if (el) { el.textContent = "0"; el.className = ""; } });
  prtMudouNivelAcao();
}
// Resposta: protocolo, prazo e o que fazer agora.
function prtMostrarRespostaRegistro(data) {
  const cx = prtEl("prtRegResposta");
  if (!cx) return;
  if (!data) { cx.innerHTML = ""; return; }
  const cat = prtCatalogos;
  const exige = data.exigeComunicacao === true;
  cx.innerHTML = `<div class="cal-cartao cartao-area-ebd prt-resposta">
    <h5>✅ Registrado ${data.protocolo ? prtSelo("cal-st-homologado", data.protocolo) : ""}</h5>
    <p>${escaparHtmlEbd(prtMsgErro(data))}</p>
    ${exige && data.prazoEm ? `<p><strong>Prazo para comunicar o Conselho Tutelar:</strong> ${prtDataHora(data.prazoEm)}</p>` : ""}
    <p><strong>O que fazer agora</strong></p>
    ${exige
    ? `<ul class="prt-nao-faca-lista">${(cat ? cat.naoFaca : []).map(t => `<li>${escaparHtmlEbd(t)}</li>`).join("")}<li>A comunicação ao Conselho Tutelar é feita pela liderança de proteção. Se a mensagem acima disser que não foi possível avisá-la, procure o Dirigente ou a Diretoria agora.</li></ul>
       <p class="psc-legenda">Se existe perigo agora, ligue 190. Para falar com alguém a qualquer hora, ligue 100 (de graça).</p>${prtHtmlContatos(cat ? cat.contatosDeAjuda : [])}`
    : "<p>Obrigado por registrar. A liderança vai conferir e tomar a providência. Não é preciso fazer mais nada agora.</p>"}
  </div>`;
  prtRolarPara("prtRegResposta");
}

// ============================================================================
// 3) ABA "PROTEÇÃO DE CRIANÇAS" (permissão protecao_menores)
// ============================================================================
// O incidente é da gestão (a Diretoria, o Comitê e o Dirigente da congregação); padrões, Comitê e relatório anual, só do nível geral (o servidor também recusa).
function prtSecaoPermitida(secao) { return secao === "incidentes" ? prtEhGestao() : PRT_SECOES.includes(secao) && prtEhGeral(); }
function prtAplicarPermissoes() {
  PRT_SECOES.forEach(nome => { const btn = prtEl(`btnPrtSecao${capitalize(nome)}`); if (btn) btn.style.display = prtSecaoPermitida(nome) ? "" : "none"; });
  const semAcesso = prtEl("prtSemAcesso");
  if (semAcesso) semAcesso.style.display = prtCatalogos && !PRT_SECOES.some(prtSecaoPermitida) ? "" : "none";
}
async function carregarOpcoesProtecaoAcao() {
  prtVerificarDono();
  if (!prtPodeAba()) return;
  const catalogo = await prtGarantirCatalogos(true);   // os papéis (gestão, nível geral) dependem da sessão
  if (!catalogo) { mostrarToast("Não foi possível carregar a Proteção de Crianças agora. Abra a aba de novo para tentar outra vez.", "erro"); return; }
  prtAplicarPermissoes();
  prtFecharDetalheInterno();   // abrir a aba (ou tocar nela de novo) sempre volta à lista: um relato lido não fica à espera
  const secao = prtSecaoPermitida(prtSecaoAtual) ? prtSecaoAtual : (PRT_SECOES.find(prtSecaoPermitida) || "");
  prtMostrarSecaoAcao(secao);
}
function prtMostrarSecaoAcao(secao, semCarregar) {
  if (!prtSecaoPermitida(secao)) secao = PRT_SECOES.find(prtSecaoPermitida) || "";
  const mudou = secao !== prtSecaoAtual;
  prtSecaoAtual = secao || "incidentes";
  if (mudou) prtFecharDetalheInterno();   // sair da ficha apaga o relato da tela
  PRT_SECOES.forEach(nome => {
    const div = prtEl(`prtSecao${capitalize(nome)}`);
    if (div) div.style.display = nome === secao ? "block" : "none";
    const btn = prtEl(`btnPrtSecao${capitalize(nome)}`);
    if (btn && btn.classList) btn.classList.toggle("ativo", nome === secao);
    if (btn && btn.setAttribute) btn.setAttribute("aria-pressed", nome === secao ? "true" : "false");
  });
  if (secao !== "incidentes") { prtRelogiosLista = []; prtPararRelogio(); }
  if (semCarregar) return;
  if (secao === "incidentes") prtCarregarIncidentesAcao();
  else if (secao === "padroes") prtCarregarPadroesAcao();
  else if (secao === "comite") prtCarregarComiteAcao();
  else if (secao === "relatorio") prtPrepararRelatorio();
}
// Chamada por mostrarAbaSecretaria quando a pessoa vai para OUTRA aba: o relógio para, o relato e a ficha saem da tela e a fila é descartada (não fica dado de criança na página).
function prtAbaFechada() {
  prtRelogiosLista = []; prtRelogioDetalhe = null;   // antes de fechar a ficha: fechar a ficha reajusta o intervalo pela lista que houver
  prtFecharDetalheInterno();
  prtPararRelogio();
  prtIncidentes = [];
  prtSeqLista++;
  // padrões (nomes de equipes e pessoas), Comitê e relatório também saem da página, e uma resposta que ainda esteja a caminho não entra depois
  prtSeqPadroes++; prtSeqComite++; prtSeqRel++;
  ["prtListaIncidentes", "prtPadroesLista", "prtComiteLista", "prtRelImprimivel"].forEach(id => { const el = prtEl(id); if (el) el.innerHTML = ""; });
  const impressao = document.body && document.body.classList;
  if (impressao) impressao.remove("prt-imprimindo");
}

// -- a) a fila de incidentes --
function prtFiltroEscolhido() { const f = prtTexto("prtFiltroStatus"); return f === "ENCERRADO" || f === "TODOS" ? f : "ABERTO"; }
async function prtCarregarIncidentesAcao() {
  const lista = prtEl("prtListaIncidentes");
  if (!lista) return;
  const filtro = prtFiltroEscolhido();
  const caminho = filtro === "TODOS" ? "incidentes" : `incidentes?status=${filtro}`;
  const seq = ++prtSeqLista;
  prtEscreverAviso("prtListaResultado", "Carregando os incidentes…", false);
  const data = await prtObter(caminho);
  if (seq !== prtSeqLista) return;   // resposta velha: outro filtro foi pedido depois, ou a pessoa saiu da aba ou trocou de login
  if (data.sucesso === false || !Array.isArray(data.incidentes)) {
    prtIncidentes = []; prtRelogiosLista = [];
    lista.innerHTML = "";
    prtAjustarRelogio();
    prtEscreverAviso("prtListaResultado", prtMsgErro(data), true);
    return;
  }
  prtAcertarRelogio(data.agora);
  prtIncidentes = data.incidentes.filter(i => i && typeof i === "object");   // a ordem é a do servidor: o que pede ação vem primeiro
  const urgentes = prtIncidentes.filter(i => i.relogio && i.status !== "ENCERRADO").length;
  prtEscreverAviso("prtListaResultado", prtIncidentes.length ? `${prtIncidentes.length} incidente(s)${urgentes ? ` — ${urgentes} esperando a comunicação ao órgão` : ""}.` : "", false);
  prtRenderLista();
}
function prtRenderLista() {
  const lista = prtEl("prtListaIncidentes");
  if (!lista) return;
  prtRelogiosLista = prtIncidentes.filter(i => i.relogio && i.status !== "ENCERRADO" && Number.isFinite(Date.parse(i.relogio.prazoEm)) && prtInteiro(i.incidenteId))
    .map(i => ({ id: `prtRelogio${Number(i.incidenteId)}`, prazoMs: Date.parse(i.relogio.prazoEm) }));
  lista.innerHTML = prtIncidentes.length
    ? prtIncidentes.map(prtRenderCartao).join("")
    : `<p class='subtitle'>${prtFiltroEscolhido() === "ENCERRADO" ? "Nenhum incidente encerrado." : prtFiltroEscolhido() === "ABERTO" ? "Nenhum incidente aberto." : "Nenhum incidente registrado."}</p>`;
  prtAjustarRelogio();
}
// Os selos do incidente (na fila e na ficha): nível, origem, situação da comunicação ao órgão, afastamento sem decisão.
function prtSelosDoIncidente(i) {
  const aberto = i.status !== "ENCERRADO";
  const sem = Number(i.cautelarSemDecisao) || 0;
  return [
    prtSelo(prtClasseNivel(i.nivel), i.nivelRotulo || i.nivel),
    i.origem === "CANAL_AJUDA" ? prtSelo("cal-st-proposto", `🧒 ${i.origemRotulo || "Canal de ajuda"}`) : "",
    aberto ? "" : prtSelo("cal-st-cancelado", `Encerrado${i.encerradoEm ? ` em ${calData(i.encerradoEm)}` : ""}`),
    i.exigeComunicacao && i.comunicado ? prtSelo("cal-st-homologado", "✅ comunicado ao órgão") : "",
    i.exigeComunicacao && i.comunicado && !i.comComprovante ? prtSelo("cal-st-indeferido", "📎 sem comprovante") : "",
    sem > 0 ? prtSelo("cal-st-proposto", "🛑 afastamento aguardando decisão") : ""
  ].filter(Boolean).join(" ");
}
function prtRenderCartao(i) {
  const id = Number(i.incidenteId);
  const aberto = i.status !== "ENCERRADO";
  const relogio = i.relogio && aberto ? prtHtmlRelogio(`prtRelogio${id}`, i.relogio.prazoEm) : "";
  return `<div class="cal-cartao cartao-area-ebd prt-cartao ${i.relogio && aberto ? "prt-cartao-urgente" : ""}">
    <h5>${escaparHtmlEbd(i.protocolo)} <span class="psc-legenda">${prtData(i.dataOcorrencia)}${i.congregacaoNome ? ` · ${escaparHtmlEbd(i.congregacaoNome)}` : ""}</span></h5>
    <p class="prt-selos">${prtSelosDoIncidente(i)}</p>
    ${relogio ? `<p class="prt-linha-relogio"><strong>Prazo para comunicar:</strong> ${relogio} <span class="psc-legenda">${prtDataHora(i.relogio.prazoEm)}</span></p>` : ""}
    <div class="psc-acoes"><button type="button" class="btn-confirmar" style="width:auto;margin:0;" data-on-click="prtAbrirDetalheAcao" data-args-click="${argsAttr(id)}">📂 Abrir</button></div>
  </div>`;
}

// -- b) a ficha do incidente --
// fecha a ficha SEM mexer na lista (quem chama decide): o relato, o formulário e o relógio da ficha saem da tela
function prtLimparDetalhe() {
  prtDetalhe = null; prtRelogioDetalhe = null;
  prtSeqDetalhe++; prtSeqRelato++;   // um pedido do relato ou da ficha que ainda esteja a caminho não entra na ficha seguinte
  const conteudo = prtEl("prtDetalheConteudo"), msg = prtEl("prtDetalheMsg"), cx = prtEl("prtDetalheCx");
  if (conteudo) conteudo.innerHTML = "";
  if (msg) { msg.textContent = ""; msg.className = "subtitle"; }
  if (cx) cx.style.display = "none";
}
function prtFecharDetalheInterno() {
  prtLimparDetalhe();
  const lista = prtEl("prtListaCx");
  if (lista) lista.style.display = "";
  prtAjustarRelogio();
}
function prtFecharDetalheAcao() { prtFecharDetalheInterno(); prtRolarPara("prtListaCx"); }
async function prtAbrirDetalheAcao(incidenteId) {
  const id = Number(incidenteId);
  if (!prtInteiro(id)) return;
  prtLimparDetalhe();   // trocar de incidente apaga o relato do anterior
  const cx = prtEl("prtDetalheCx"), lista = prtEl("prtListaCx"), conteudo = prtEl("prtDetalheConteudo");
  if (cx) cx.style.display = "block";
  if (lista) lista.style.display = "none";
  if (conteudo) conteudo.innerHTML = `<p class="subtitle" role="status">Carregando o incidente…</p>`;
  prtRolarPara("prtDetalheCx");
  await prtCarregarDetalhe(id);
}
async function prtCarregarDetalhe(id) {
  const seq = ++prtSeqDetalhe;
  const data = await prtObter(`incidente?incidenteId=${id}`);
  if (seq !== prtSeqDetalhe) return false;   // outro incidente foi aberto, a pessoa saiu da ficha, da aba ou trocou de login
  const conteudo = prtEl("prtDetalheConteudo");
  if (!conteudo) return false;
  prtSeqRelato++;                            // a ficha vai ser refeita: o relato que estava aberto sai
  if (data.sucesso === false || !data.incidente || typeof data.incidente !== "object") {
    prtDetalhe = null; prtRelogioDetalhe = null; prtAjustarRelogio();
    // 404 é a MESMA resposta para "não existe", "fora do seu alcance" e "você é um dos envolvidos": a tela não distingue nem insinua nada
    conteudo.innerHTML = `<p class="subtitle psc-aviso" role="status">${escaparHtmlEbd(data.httpStatus === 404 ? PRT_MSG_NAO_ABRIU : prtMsgErro(data))}</p>`;
    return false;
  }
  prtAcertarRelogio(data.agora);
  prtDetalhe = data;
  prtRenderDetalhe();
  return true;
}
function prtAtualizarDetalheAcao() {
  if (!prtDetalhe) return;
  prtCarregarDetalhe(Number(prtDetalhe.incidente.incidenteId));
}
function prtRotuloCautelar(e) {
  if (e.afastamentoCautelar) return e.ultimaDecisao === "MANTIDO_AFASTADO" ? "🛑 afastamento cautelar (mantido pelo Comitê)" : "🛑 afastamento cautelar (aguardando a decisão)";
  return e.ultimaDecisao === "LIBERADO" ? "afastamento levantado" : "";
}
function prtHtmlEnvolvidos(d) {
  const lista = Array.isArray(d.envolvidos) ? d.envolvidos : [];
  if (!lista.length) return "<p class='subtitle'>Nenhuma pessoa envolvida foi informada.</p>";
  const podeDecidir = !!(d.acoes && d.acoes.decidirCautelar);
  const podeVincular = !!(d.acoes && d.acoes.vincularEnvolvido);   // só o nível geral, com o incidente aberto: liga a pessoa registrada só pelo nome a uma matrícula do cadastro
  return `<ul class="prt-lista">${lista.map(e => {
    const eid = Number(e.envolvidoId);
    const cautelar = prtRotuloCautelar(e);
    return `<li><strong>${escaparHtmlEbd(e.nome)}</strong>
      ${e.ehMembro ? `<span class="psc-legenda">matrícula ${Number(e.membroId)}</span>` : "<span class='psc-legenda'>sem matrícula</span>"}
      ${cautelar ? prtSelo(e.afastamentoCautelar ? "cal-st-indeferido" : "cal-st-homologado", cautelar) : ""}
      ${podeDecidir && e.ehMembro && d.incidente.nivel === "ALEGACAO" ? `<div class="psc-acoes"><button type="button" class="btn-confirmar btn-secundario" style="width:auto;margin:0;" data-on-click="prtAbrirFormAcao" data-args-click="${argsAttr("decidir", eid)}">⚖️ Decidir o afastamento</button></div>` : ""}
      ${podeVincular && !e.ehMembro ? `<div class="psc-acoes"><button type="button" class="btn-confirmar btn-secundario" style="width:auto;margin:0;" data-on-click="prtAbrirFormAcao" data-args-click="${argsAttr("vincular", eid)}">🔗 Vincular a uma pessoa do cadastro</button></div>` : ""}
    </li>`;
  }).join("")}</ul>`;
}
function prtHtmlComunicacoes(d) {
  const lista = Array.isArray(d.comunicacoes) ? d.comunicacoes : [];
  if (!lista.length) return d.incidente.exigeComunicacao ? "<p class='subtitle psc-aviso'>Ainda não há comunicação registrada ao Conselho Tutelar (ou a outro órgão de proteção).</p>" : "<p class='subtitle'>Este incidente não exige comunicação a um órgão.</p>";
  return lista.map(c => `<div class="prt-item">
    <p><strong>${escaparHtmlEbd(c.orgaoRotulo || c.orgao)}</strong> · ${escaparHtmlEbd(c.formaRotulo || c.forma)} · ${prtDataHora(c.comunicadoEm)}
      ${c.foraDoPrazo ? prtSelo("cal-st-indeferido", "⏰ fora do prazo") : prtSelo("cal-st-homologado", "no prazo")}</p>
    <dl class="cal-dl">
      ${prtCampo("Protocolo do órgão", c.protocoloExterno ? escaparHtmlEbd(c.protocoloExterno) : "")}
      ${prtCampo("Comprovante guardado em", c.referenciaArquivo ? escaparHtmlEbd(c.referenciaArquivo) : "")}
      ${prtCampo("Observação", c.observacao ? escaparHtmlEbd(c.observacao) : "")}
      ${prtCampo("Registrada por", c.registradoPorNome ? `${escaparHtmlEbd(c.registradoPorNome)} em ${prtDataHora(c.registradoEm)}` : "")}
    </dl>
  </div>`).join("");
}
function prtHtmlDecisoes(d) {
  const lista = Array.isArray(d.decisoes) ? d.decisoes : [];
  if (!lista.length) return "";
  const nomeDe = (envolvidoId) => { const e = (d.envolvidos || []).find(x => Number(x.envolvidoId) === Number(envolvidoId)); return e ? e.nome : ""; };
  return `<h5>⚖️ Decisões sobre o afastamento</h5>${lista.map(x => `<div class="prt-item">
    <p><strong>${escaparHtmlEbd(x.decisaoRotulo || x.decisao)}</strong> ${nomeDe(x.envolvidoId) ? `— ${escaparHtmlEbd(nomeDe(x.envolvidoId))}` : ""}</p>
    <p class="psc-legenda">${escaparHtmlEbd(x.decididaPorNome)} em ${prtDataHora(x.decididaEm)}</p>
    <p class="prt-texto">${escaparHtmlEbd(x.observacao)}</p>
  </div>`).join("")}`;
}
function prtHtmlReclassificacoes(d) {
  const lista = Array.isArray(d.reclassificacoes) ? d.reclassificacoes : [];
  if (!lista.length) return "";
  return `<h5>⬆️ Mudanças de nível</h5>${lista.map(x => `<div class="prt-item">
    <p><strong>${escaparHtmlEbd(prtRotuloNivel(x.de))}</strong> → <strong>${escaparHtmlEbd(prtRotuloNivel(x.para))}</strong></p>
    <p class="psc-legenda">${escaparHtmlEbd(x.porNome)} em ${prtDataHora(x.em)}</p>
    <p class="prt-texto">${escaparHtmlEbd(x.motivo)}</p>
  </div>`).join("")}`;
}
function prtHtmlParaEncerrar(d) {
  const inc = d.incidente;
  if (inc.status === "ENCERRADO") {
    const e = inc.encerramento && typeof inc.encerramento === "object" ? inc.encerramento : null;
    return e ? `<p><strong>${escaparHtmlEbd(e.resultadoRotulo || e.resultado)}</strong> · ${prtDataHora(e.em)}</p><p class="prt-texto">${escaparHtmlEbd(e.providencia)}</p>` : "<p class='subtitle'>Este incidente foi encerrado.</p>";
  }
  const enc = d.encerramentoPossivel && typeof d.encerramentoPossivel === "object" ? d.encerramentoPossivel : null;
  if (!enc) return "";
  const motivos = Array.isArray(enc.motivos) ? enc.motivos : [];
  return enc.ok
    ? "<p class='vol-selo-ok'>✅ Não falta nada: o caso já pode ser encerrado.</p>"
    : `<p class="psc-aviso" role="status"><strong>Ainda falta para encerrar:</strong></p><ul class="prt-lista">${motivos.map(m => `<li>${escaparHtmlEbd(m)}</li>`).join("")}</ul>`;
}
function prtHtmlBotoesDetalhe(d) {
  const a = d.acoes && typeof d.acoes === "object" ? d.acoes : {};
  const id = Number(d.incidente.incidenteId);
  const botao = (acao, argumentos, texto, classe) => `<button type="button" class="btn-confirmar ${classe}" style="width:auto;margin:0;" data-on-click="${acao}" data-args-click="${argsAttr(...argumentos)}">${texto}</button>`;
  return [
    a.comunicar ? botao("prtAbrirFormAcao", ["comunicacao"], "📞 Registrar a comunicação ao órgão", "") : "",
    a.adendo ? botao("prtAbrirFormAcao", ["adendo"], "➕ Adendo", "btn-secundario") : "",
    a.reclassificar ? botao("prtAbrirFormAcao", ["reclassificar"], "⬆️ Reclassificar", "btn-secundario") : "",
    a.encerrar ? botao("prtAbrirFormAcao", ["encerrar"], "✅ Encerrar o caso", "btn-secundario") : "",
    botao("prtAtualizarDetalheAcao", [], "🔄 Atualizar", "btn-secundario"),
    d.incidente.exigeComunicacao ? botao("abrirModalAnexos", ["IncidentesProtecao", id, `comprovante ${d.incidente.protocolo}`], "📎 Anexar comprovante", "btn-secundario") : ""
  ].filter(Boolean).join(" ");
}
function prtRenderDetalhe() {
  const d = prtDetalhe;
  const conteudo = prtEl("prtDetalheConteudo");
  if (!d || !conteudo) return;
  const inc = d.incidente;
  const id = Number(inc.incidenteId);
  const aberto = inc.status !== "ENCERRADO";
  prtRelogioDetalhe = inc.relogio && aberto && Number.isFinite(Date.parse(inc.relogio.prazoEm)) ? { id: "prtRelogioDet", prazoMs: Date.parse(inc.relogio.prazoEm) } : null;
  const relato = d.relato && typeof d.relato === "object" ? d.relato : { registrado: false, adendos: 0 };
  const adendos = Number(relato.adendos) || 0;
  const leituras = Array.isArray(d.leituras) ? d.leituras : [];
  conteudo.innerHTML = `<div class="cal-cartao cartao-area-ebd prt-detalhe">
    <h4>${escaparHtmlEbd(inc.protocolo)}</h4>
    <p class="prt-selos">${prtSelosDoIncidente(inc)}</p>
    ${prtRelogioDetalhe ? `<p class="prt-linha-relogio"><strong>Prazo para comunicar o Conselho Tutelar:</strong> ${prtHtmlRelogio("prtRelogioDet", inc.relogio.prazoEm)} <span class="psc-legenda">${prtDataHora(inc.relogio.prazoEm)}</span></p>` : ""}
    <dl class="cal-dl">
      ${prtCampo("Congregação", inc.congregacaoNome ? escaparHtmlEbd(inc.congregacaoNome) : "")}
      ${prtCampo("Equipe", inc.equipeNome ? escaparHtmlEbd(inc.equipeNome) : "")}
      ${prtCampo("Aconteceu em", inc.dataOcorrencia ? prtData(inc.dataOcorrencia) : "")}
      ${prtCampo("Onde", inc.onde ? escaparHtmlEbd(inc.onde) : "")}
      ${prtCampo("A Igreja soube em", inc.conhecidoEm ? prtDataHora(inc.conhecidoEm) : "")}
      ${prtCampo("Quem contou ou percebeu", inc.relatadoPorRotulo ? escaparHtmlEbd(inc.relatadoPorRotulo) : "")}
      ${prtCampo("Contato deixado (canal de ajuda)", inc.contatoCanal ? escaparHtmlEbd(inc.contatoCanal) : "")}
      ${prtCampo("Registrado por", inc.registradoPor && typeof inc.registradoPor === "object" && inc.registradoPor.nome ? escaparHtmlEbd(inc.registradoPor.nome) : "")}
      ${prtCampo("Registrado em", inc.registradoEm ? prtDataHora(inc.registradoEm) : "")}
    </dl>
    <h5>O que aconteceu (só os fatos)</h5>
    <p class="prt-texto">${escaparHtmlEbd(inc.descricao)}</p>
    <h5>👥 Pessoa envolvida</h5>
    ${prtHtmlEnvolvidos(d)}
    <h5>📞 Comunicação aos órgãos de proteção</h5>
    ${prtHtmlComunicacoes(d)}
    <p class="psc-legenda">${Number(d.anexos) || 0} arquivo(s) anexado(s). Ao anexar o comprovante, não coloque o nome da criança no nome do arquivo.</p>
    ${prtHtmlDecisoes(d)}
    ${prtHtmlReclassificacoes(d)}
    <h5>🔒 Relato</h5>
    ${relato.registrado
    ? `<p>Há um relato guardado${adendos ? ` e ${adendos} adendo(s)` : ""}. Ele só aparece depois que você pedir, e cada leitura fica registrada com o seu nome.</p>
       <div class="psc-acoes"><button type="button" class="btn-confirmar" style="width:auto;margin:0;" data-on-click="prtLerRelatoAcao" data-args-click="${argsAttr(id, ARG.elemento)}">🔒 Ler o relato</button></div>`
    : "<p class='subtitle'>Não há relato guardado.</p>"}
    <div id="prtRelatoCx" class="prt-relato" role="region" aria-label="Relato guardado (a leitura fica registrada)" style="display:none;">
      <div class="prt-relato-topo"><strong>🔒 Relato (leitura registrada)</strong>
        <button type="button" class="btn-link" data-on-click="prtFecharRelatoAcao">✖ Fechar e apagar da tela</button></div>
      <div id="prtRelatoCorpo"></div>
    </div>
    ${leituras.length ? `<p class="psc-legenda"><strong>Quem leu o relato:</strong> ${leituras.map(l => `${escaparHtmlEbd(l.nome)} (${prtDataHora(l.em)})`).join("; ")}</p>` : ""}
    <h5>${aberto ? "✅ O que falta para encerrar" : "✅ Como o caso terminou"}</h5>
    ${prtHtmlParaEncerrar(d)}
    <div class="psc-acoes prt-acoes-detalhe">${prtHtmlBotoesDetalhe(d)}</div>
    <div id="prtFormAcao"></div>
  </div>`;
  prtAjustarRelogio();
}

// -- c) o relato protegido: lido sob confirmação reforçada, cada leitura fica registrada; entra na tela só por textContent e sai ao fechar, ao trocar de incidente, ao sair da aba e ao trocar de login --
function prtLimparRelato() {
  const corpo = prtEl("prtRelatoCorpo"), cx = prtEl("prtRelatoCx");
  prtSeqRelato++;
  if (corpo) corpo.textContent = "";
  if (cx) cx.style.display = "none";
}
function prtFecharRelatoAcao() { prtLimparRelato(); }
function prtLinhaRelato(corpo, tag, classe, texto) {
  const el = document.createElement(tag);
  if (classe) el.className = classe;
  el.textContent = texto;   // textContent, nunca innerHTML: o relato é o que uma criança contou e nenhuma marcação pode ser executada
  corpo.appendChild(el);
}
function prtMostrarRelato(dados) {
  const corpo = prtEl("prtRelatoCorpo"), cx = prtEl("prtRelatoCx");
  if (!corpo || !cx) return;
  corpo.textContent = "";
  const relato = dados.relato && typeof dados.relato === "object" ? dados.relato : null;
  const adendos = Array.isArray(dados.adendos) ? dados.adendos : [];
  if (relato) {
    prtLinhaRelato(corpo, "h5", "", `O que foi contado (registrado em ${calDataHora(relato.registradoEm)})`);
    prtLinhaRelato(corpo, "p", "prt-texto", String(relato.texto == null ? "" : relato.texto));
  } else prtLinhaRelato(corpo, "p", "subtitle", "Não há relato guardado.");
  adendos.forEach((a, i) => {
    prtLinhaRelato(corpo, "h5", "", `Adendo ${i + 1} (registrado em ${calDataHora(a && a.registradoEm)})`);
    prtLinhaRelato(corpo, "p", "prt-texto", String(a && a.texto != null ? a.texto : ""));
  });
  cx.style.display = "block";
}
async function prtLerRelatoAcao(incidenteId, botao) {
  const id = Number(incidenteId);
  if (!prtDetalhe || id !== Number(prtDetalhe.incidente.incidenteId)) return;
  if (!(await confirmarAcao("Esta leitura fica registrada com o seu nome (quem leu e quando). O relato é o que uma criança ou adolescente contou: leia com cuidado, não copie e não repasse a ninguém fora da liderança de proteção. Ler agora?", "Ler o relato"))) return;
  prtLimparRelato();
  const seq = prtSeqRelato;
  await prtProtegerBotao(botao, async () => {
    const data = await prtPostar("relato", { incidenteId: id });   // 428 (confirmação reforçada): o fetchProtegido confirma e repete a chamada uma vez
    if (seq !== prtSeqRelato) return;   // a pessoa trocou de incidente, fechou, saiu da aba ou trocou de login: o relato NÃO entra na tela
    if (data.sucesso === false) { prtMostrarResultado(data, "prtDetalheMsg", true); return; }
    prtEscreverAviso("prtDetalheMsg", "", false);
    prtMostrarRelato(data);
    prtRolarPara("prtRelatoCx");
  }, `relato${id}`);
}

// -- d) os atos sobre o incidente: comunicação ao órgão, adendo, reclassificação, decisão do afastamento, encerramento --
function prtTipoFormValido(bruto) { return PRT_FORMS.includes(bruto) ? bruto : ""; }
function prtAvisoForm(id, texto) { prtEscreverAviso(id, texto, true); }
function prtFormComunicacao() {
  const cat = prtCatalogos;
  return `<div class="cal-form-inline">
    <strong>📞 Registrar a comunicação ao órgão de proteção</strong>
    <p class="psc-legenda">Registre quando e como o Conselho Tutelar (ou outro órgão) foi avisado. Isso para o relógio de 24 horas, fica registrado com o seu nome e não pode ser apagado.</p>
    <label for="prtFcOrgao">Órgão avisado</label>
    <select id="prtFcOrgao">${prtOpcoes(cat.orgaos, x => x.codigo, x => x.rotulo, "— escolha o órgão —")}</select>
    <label for="prtFcForma">Como foi avisado</label>
    <select id="prtFcForma">${prtOpcoes(cat.formas, x => x.codigo, x => x.rotulo, "— escolha a forma —")}</select>
    <label for="prtFcQuando">Data e hora em que o órgão foi avisado</label>
    <input type="datetime-local" id="prtFcQuando" value="${escaparHtmlEbd(prtAgoraLocalInput())}" />
    <label for="prtFcProtocolo">Número de protocolo do órgão (se houver: o número que o órgão deu, com pelo menos 4 letras ou números)</label>
    <input type="text" id="prtFcProtocolo" maxlength="60" />
    <label for="prtFcArquivo">Onde o comprovante está guardado (se for papel, diga com clareza; até 200 caracteres)</label>
    <input type="text" id="prtFcArquivo" maxlength="200" placeholder="Ex.: Pasta de proteção, folha 4" />
    <label for="prtFcObs">Observação (opcional, até 300 caracteres; sem o nome da criança)</label>
    <textarea id="prtFcObs" rows="2" maxlength="300" style="width:100%;" data-on-input="prtContarAcao" data-args-input="${argsAttr("prtFcObs")}"></textarea>
    <p class="psc-legenda"><span id="prtFcObsContador">0</span>/300 caracteres. O comprovante pode ser o protocolo, o papel guardado ou um arquivo anexado (use "Anexar comprovante"): sem um deles o caso não encerra.</p>
    <div class="psc-acoes">
      <button type="button" class="btn-confirmar" style="width:auto;margin:0;" data-on-click="prtEnviarComunicacaoAcao" data-args-click="${argsAttr(ARG.elemento)}">📞 Registrar</button>
      <button type="button" class="btn-link" data-on-click="prtFecharFormAcao">cancelar</button>
    </div>
    <p id="prtFcMsg" class="subtitle" role="status"></p>
  </div>`;
}
function prtFormAdendo() {
  return `<div class="cal-form-inline">
    <strong>➕ Adendo ao relato</strong>
    <p class="cnl-aviso-senha" role="note"><strong>Só se a criança contou algo mais por conta própria.</strong> Registre com as palavras dela. <strong>Não faça novas perguntas</strong> para obter mais: repetir a conversa machuca de novo. O que for novo deve ir direto às autoridades.</p>
    <label for="prtFaTexto">O que a criança disse (de 10 a 2000 caracteres)</label>
    <textarea id="prtFaTexto" rows="4" maxlength="2000" style="width:100%;" data-on-input="prtContarAcao" data-args-input="${argsAttr("prtFaTexto")}"></textarea>
    <p class="psc-legenda"><span id="prtFaContador">0</span>/2000 caracteres. São aceitos no máximo 5 adendos por caso.</p>
    <div class="psc-acoes">
      <button type="button" class="btn-confirmar" style="width:auto;margin:0;" data-on-click="prtEnviarAdendoAcao" data-args-click="${argsAttr(ARG.elemento)}">➕ Registrar o adendo</button>
      <button type="button" class="btn-link" data-on-click="prtFecharFormAcao">cancelar</button>
    </div>
    <p id="prtFaMsg" class="subtitle" role="status"></p>
  </div>`;
}
// só se sobe de nível: as opções são as de nível MAIOR que o atual (a ordem do catálogo é a ordem de gravidade)
function prtNiveisAcima(nivelAtual) {
  const niveis = prtCatalogos ? prtCatalogos.niveis : [];
  const atual = niveis.findIndex(n => n.codigo === nivelAtual);
  return atual < 0 ? [] : niveis.filter((n, i) => i > atual);
}
function prtFormReclassificar() {
  const cat = prtCatalogos;
  const acima = prtNiveisAcima(prtDetalhe.incidente.nivel);
  return `<div class="cal-form-inline">
    <strong>⬆️ Reclassificar o incidente</strong>
    <p class="psc-legenda">Só se pode aumentar a gravidade: a Igreja nunca decide que uma suspeita de violência "não era nada". Quem sobe para suspeita ou relato de violência passa a ter o relógio de 24 horas.</p>
    <label for="prtFrNivel">Novo nível</label>
    <select id="prtFrNivel" data-on-change="prtMudouNivelReclassAcao">${prtOpcoes(acima, x => x.codigo, x => x.rotulo, "— escolha o novo nível —")}</select>
    <label for="prtFrMotivo">Por que o incidente é mais grave (de 10 a 300 caracteres)</label>
    <textarea id="prtFrMotivo" rows="2" maxlength="300" style="width:100%;" data-on-input="prtContarAcao" data-args-input="${argsAttr("prtFrMotivo")}"></textarea>
    <p class="psc-legenda"><span id="prtFrMotivoContador">0</span>/300 caracteres.</p>
    <div id="prtFrAlegCx" style="display:none;">
      <p class="cnl-aviso-senha" role="note">Para subir a suspeita ou relato de violência, registre também quem contou e o relato, do jeito que foi dito. Este ato pede <strong>uma confirmação recente de quem você é</strong> (chave de acesso ou código por e-mail): a tela pede na hora de registrar.</p>
      ${prtHtmlRoteiro()}
      <label for="prtFrQuem">Quem contou ou percebeu o fato</label>
      <select id="prtFrQuem">${prtOpcoes(cat.quemRelatou, x => x.codigo, x => x.rotulo, "— escolha —")}</select>
      <label for="prtFrRelato">O relato (de 10 a 4000 caracteres)</label>
      <textarea id="prtFrRelato" rows="4" maxlength="4000" style="width:100%;" data-on-input="prtContarAcao" data-args-input="${argsAttr("prtFrRelato")}"></textarea>
      <p class="psc-legenda"><span id="prtFrRelatoContador">0</span>/4000 caracteres.</p>
    </div>
    <div class="psc-acoes">
      <button type="button" class="btn-confirmar" style="width:auto;margin:0;" data-on-click="prtEnviarReclassificacaoAcao" data-args-click="${argsAttr(ARG.elemento)}">⬆️ Reclassificar</button>
      <button type="button" class="btn-link" data-on-click="prtFecharFormAcao">cancelar</button>
    </div>
    <p id="prtFrMsg" class="subtitle" role="status"></p>
  </div>`;
}
function prtMudouNivelReclassAcao() {
  const bloco = prtEl("prtFrAlegCx");
  if (bloco) bloco.style.display = prtTexto("prtFrNivel") === "ALEGACAO" ? "" : "none";
}
function prtFormDecidir(envolvido) {
  const cat = prtCatalogos;
  return `<div class="cal-form-inline">
    <strong>⚖️ Decidir o afastamento cautelar de ${escaparHtmlEbd(envolvido.nome)}</strong>
    <p class="cnl-aviso-senha" role="note">Este ato pede <strong>uma confirmação recente de quem você é</strong> (a chave de acesso do aparelho ou um código enviado ao seu e-mail): a tela pede na hora de registrar. O afastamento é por cautela, <strong>não é punição</strong>. A pessoa não pode ler o motivo que você escrever aqui. Quem manteve o afastamento não pode levantá-lo: outra pessoa da Diretoria ou do Comitê precisa fazer isso.</p>
    <label for="prtFdDecisao">O que o Comitê decide</label>
    <select id="prtFdDecisao">${prtOpcoes(cat.decisoes, x => x.codigo, x => x.rotulo, "— escolha —")}</select>
    <label for="prtFdObs">Motivo da decisão (de 10 a 300 caracteres, sem o nome da criança)</label>
    <textarea id="prtFdObs" rows="3" maxlength="300" style="width:100%;" data-on-input="prtContarAcao" data-args-input="${argsAttr("prtFdObs")}"></textarea>
    <p class="psc-legenda"><span id="prtFdContador">0</span>/300 caracteres.</p>
    <div class="psc-acoes">
      <button type="button" class="btn-confirmar" style="width:auto;margin:0;" data-on-click="prtEnviarDecisaoAcao" data-args-click="${argsAttr(Number(envolvido.envolvidoId), ARG.elemento)}">⚖️ Registrar a decisão</button>
      <button type="button" class="btn-link" data-on-click="prtFecharFormAcao">cancelar</button>
    </div>
    <p id="prtFdMsg" class="subtitle" role="status"></p>
  </div>`;
}
// o resultado que o servidor aceita: suspeita de violência só termina "encaminhado às autoridades"; os outros níveis, medida interna ou sem continuidade
// Vincular a pessoa registrada só pelo nome (ou por uma matrícula que não existia) a uma pessoa do cadastro. O servidor pode sugerir quem tem o mesmo nome (`possiveisMembros`, só para o nível geral).
function prtFormVincular(envolvido) {
  const sugestoes = Array.isArray(prtDetalhe.possiveisMembros) ? prtDetalhe.possiveisMembros.find(p => Number(p.envolvidoId) === Number(envolvido.envolvidoId)) : null;
  const candidatos = sugestoes && Array.isArray(sugestoes.membros) ? sugestoes.membros : [];
  return `<div class="cal-form-inline">
    <strong>🔗 Vincular ${escaparHtmlEbd(envolvido.nome)} a uma pessoa do cadastro</strong>
    <p class="cnl-aviso-senha" role="note">Este ato pede <strong>uma confirmação recente de quem você é</strong>. Numa suspeita de violência, <strong>a pessoa vinculada sai das escalas com crianças na hora</strong> (por cautela, não é punição) e o Comitê precisa decidir sobre o afastamento. Se a pessoa vinculada for quem está lendo, o incidente deixa de aparecer para ela. Confira a matrícula: o vínculo não se desfaz.</p>
    ${candidatos.length ? `<p class="psc-legenda">Pessoas do cadastro com o mesmo nome (confira antes de escolher):</p>
      <ul class="prt-lista">${candidatos.map(m => `<li>matrícula <strong>${Number(m.membroId)}</strong>: ${escaparHtmlEbd(m.nome)}${m.congregacaoNome ? ` (${escaparHtmlEbd(m.congregacaoNome)})` : ""}
        <button type="button" class="btn-link" data-on-click="prtEscolherMembroVinculoAcao" data-args-click="${argsAttr(Number(m.membroId))}">usar esta matrícula</button></li>`).join("")}</ul>` : ""}
    <label for="prtFvMatricula">Matrícula da pessoa</label>
    <input type="number" id="prtFvMatricula" min="1" />
    <div class="psc-acoes">
      <button type="button" class="btn-confirmar" style="width:auto;margin:0;" data-on-click="prtEnviarVinculoAcao" data-args-click="${argsAttr(Number(envolvido.envolvidoId), ARG.elemento)}">🔗 Vincular</button>
      <button type="button" class="btn-link" data-on-click="prtFecharFormAcao">cancelar</button>
    </div>
    <p id="prtFvMsg" class="subtitle" role="status"></p>
  </div>`;
}
function prtEscolherMembroVinculoAcao(membroId) {
  const campo = prtEl("prtFvMatricula");
  if (campo && prtInteiro(membroId)) campo.value = String(Number(membroId));
}
// "Sem conteúdo de proteção" só aparece quando o servidor o oferece nesta ficha (pedido do canal de ajuda, sem pessoa do cadastro vinculada): é a ÚNICA forma de encerrar uma suspeita sem comunicar ao órgão.
function prtResultadosPossiveis(d) {
  const todos = prtCatalogos ? prtCatalogos.resultados : [];
  const suspeita = d.incidente.nivel === "ALEGACAO";
  const arquivar = !!(d.acoes && d.acoes.arquivarSemConteudo);
  return todos.filter(r => (r.codigo === PRT_RESULTADO_SEM_CONTEUDO ? arquivar : suspeita === (r.codigo === "ENCAMINHADO_AUTORIDADE")));
}
function prtMudouResultadoAcao() {
  const aviso = prtEl("prtFeAvisoSemConteudo");
  if (aviso) aviso.style.display = prtTexto("prtFeResultado") === PRT_RESULTADO_SEM_CONTEUDO ? "" : "none";
}
function prtFormEncerrar() {
  const d = prtDetalhe;
  const enc = d.encerramentoPossivel && typeof d.encerramentoPossivel === "object" ? d.encerramentoPossivel : null;
  const motivos = enc && enc.ok === false && Array.isArray(enc.motivos) ? enc.motivos : [];
  return `<div class="cal-form-inline">
    <strong>✅ Encerrar o caso</strong>
    <p class="cnl-aviso-senha" role="note">Este ato pede <strong>uma confirmação recente de quem você é</strong> (chave de acesso ou código por e-mail). O registro fica guardado para sempre, mas o caso sai da fila de abertos e não recebe mais comunicação, adendo nem reclassificação.</p>
    ${motivos.length ? `<p class="psc-aviso" role="status"><strong>Ainda falta:</strong> ${motivos.map(m => escaparHtmlEbd(m)).join(" ")}</p>` : ""}
    <label for="prtFeResultado">Como o caso termina para a Igreja</label>
    <select id="prtFeResultado" data-on-change="prtMudouResultadoAcao">${prtOpcoes(prtResultadosPossiveis(d), x => x.codigo, x => x.rotulo, "— escolha —")}</select>
    <p id="prtFeAvisoSemConteudo" class="cnl-aviso-senha" role="note" style="display:none;"><strong>Cuidado.</strong> Isto encerra o pedido <strong>SEM comunicar ao Conselho Tutelar</strong>. Só vale para teste, engano ou texto sem relato de violência. Se há qualquer relato de violência, NÃO arquive: comunique ao Conselho Tutelar. Explique abaixo, em poucas palavras, por que não há conteúdo de proteção. Todos os outros da Diretoria e do Comitê serão avisados deste arquivamento.</p>
    <label for="prtFeProvidencia">O que foi feito (de 10 a 500 caracteres, sem o nome da criança)</label>
    <textarea id="prtFeProvidencia" rows="3" maxlength="500" style="width:100%;" data-on-input="prtContarAcao" data-args-input="${argsAttr("prtFeProvidencia")}"></textarea>
    <p class="psc-legenda"><span id="prtFeContador">0</span>/500 caracteres.</p>
    <div class="psc-acoes">
      <button type="button" class="btn-confirmar btn-perigo" style="width:auto;margin:0;" data-on-click="prtEnviarEncerramentoAcao" data-args-click="${argsAttr(ARG.elemento)}">✅ Encerrar o caso</button>
      <button type="button" class="btn-link" data-on-click="prtFecharFormAcao">cancelar</button>
    </div>
    <p id="prtFeMsg" class="subtitle" role="status"></p>
  </div>`;
}
function prtAbrirFormAcao(tipoBruto, extra) {
  const tipo = prtTipoFormValido(tipoBruto);
  const area = prtEl("prtFormAcao");
  if (!tipo || !area || !prtDetalhe || !prtCatalogos) return;
  const porEnvolvido = tipo === "decidir" || tipo === "vincular";
  const envolvido = porEnvolvido ? (prtDetalhe.envolvidos || []).find(e => Number(e.envolvidoId) === Number(extra)) : null;
  if (porEnvolvido && !envolvido) return;
  area.innerHTML = tipo === "comunicacao" ? prtFormComunicacao() : tipo === "adendo" ? prtFormAdendo() : tipo === "reclassificar" ? prtFormReclassificar() : tipo === "decidir" ? prtFormDecidir(envolvido)
    : tipo === "vincular" ? prtFormVincular(envolvido) : prtFormEncerrar();
  prtRolarPara("prtFormAcao");
}
function prtFecharFormAcao() {
  const area = prtEl("prtFormAcao");
  if (area) area.innerHTML = "";
}
// Depois de um ato que deu certo: a ficha e a fila são refeitas e a mensagem do servidor volta para o lugar dela.
async function prtDepoisDoAto(id, mensagem) {
  const ok = await prtCarregarDetalhe(id);
  if (ok) prtEscreverAviso("prtDetalheMsg", mensagem, false);
  prtCarregarIncidentesAcao();
}
function prtIncidenteAberto() { return prtDetalhe ? Number(prtDetalhe.incidente.incidenteId) : 0; }

async function prtEnviarComunicacaoAcao(botao) {
  const id = prtIncidenteAberto();
  if (!id) return;
  const orgao = prtTexto("prtFcOrgao"), forma = prtTexto("prtFcForma"), quandoTexto = prtTexto("prtFcQuando");
  const protocoloExterno = prtTexto("prtFcProtocolo"), referenciaArquivo = prtTexto("prtFcArquivo"), observacao = prtTexto("prtFcObs");
  const erro = (texto) => { mostrarToast(texto, "erro"); prtAvisoForm("prtFcMsg", texto); };
  if (!orgao) { erro("Escolha o órgão que foi avisado (Conselho Tutelar, Ministério Público, Polícia...)."); return; }
  if (!forma) { erro("Escolha como o órgão foi avisado (ofício, pessoalmente, telefone...)."); return; }
  const quando = new Date(quandoTexto);
  if (!quandoTexto || Number.isNaN(quando.getTime())) { erro("Informe a data e a hora em que o órgão foi avisado."); return; }
  if (quando.getTime() > Date.now() + 5 * 60000) { erro("A hora em que o órgão foi avisado não pode estar no futuro."); return; }
  const ciencia = Date.parse(prtDetalhe.incidente.conhecidoEm);
  if (Number.isFinite(ciencia) && quando.getTime() < ciencia - 60000) { erro(`A comunicação não pode ser anterior ao momento em que a Igreja ficou sabendo (${calDataHora(prtDetalhe.incidente.conhecidoEm)}).`); return; }
  if (protocoloExterno.length > 60 || prtTemMarca(protocoloExterno)) { erro("O número de protocolo do órgão aceita até 60 caracteres, sem < ou >."); return; }
  if (referenciaArquivo.length > 200 || prtTemMarca(referenciaArquivo)) { erro("Onde o comprovante está guardado: até 200 caracteres, sem < ou >."); return; }
  if (observacao.length > 300 || prtTemMarca(observacao)) { erro("A observação aceita até 300 caracteres, sem < ou >."); return; }
  const rotuloOrgao = prtRotuloDe(prtCatalogos.orgaos, orgao);
  if (!(await confirmarAcao(`Registrar que ${rotuloOrgao} foi avisado em ${calDataHora(quando.toISOString())}? Isso para o relógio de 24 horas deste caso, fica registrado com o seu nome e não pode ser apagado. Confira o órgão e a hora.`, "Registrar a comunicação"))) return;
  const corpo = { incidenteId: id, orgao, forma, comunicadoEm: quando.toISOString() };
  if (protocoloExterno) corpo.protocoloExterno = protocoloExterno;
  if (referenciaArquivo) corpo.referenciaArquivo = referenciaArquivo;
  if (observacao) corpo.observacao = observacao;
  await prtProtegerBotao(botao, async () => {
    const data = await prtPostar("comunicacao", corpo);
    if (id !== prtIncidenteAberto()) return;   // a pessoa abriu outro incidente (ou saiu) enquanto o pedido ia
    prtMostrarResultado(data, "prtFcMsg", false);
    if (data.sucesso === false) return;       // recusa de regra: mensagem do servidor e formulário aberto, com o que foi escrito
    await prtDepoisDoAto(id, prtMsgErro(data));
  }, `comunicacao${id}`);
}
async function prtEnviarAdendoAcao(botao) {
  const id = prtIncidenteAberto();
  if (!id) return;
  const texto = prtTexto("prtFaTexto");
  if (texto.length < 10 || texto.length > 2000 || prtTemMarca(texto)) { mostrarToast("Registre só o que a criança disse por conta própria, com as palavras dela (de 10 a 2000 caracteres, sem < ou >). Não faça novas perguntas.", "erro"); prtAvisoForm("prtFaMsg", "Registre só o que a criança disse por conta própria, de 10 a 2000 caracteres, sem < ou >."); return; }
  await prtProtegerBotao(botao, async () => {
    const data = await prtPostar("adendo", { incidenteId: id, texto });
    if (id !== prtIncidenteAberto()) return;
    prtMostrarResultado(data, "prtFaMsg", false);
    if (data.sucesso === false) return;
    await prtDepoisDoAto(id, prtMsgErro(data));
  }, `adendo${id}`);
}
async function prtEnviarReclassificacaoAcao(botao) {
  const id = prtIncidenteAberto();
  if (!id) return;
  const nivelNovo = prtTexto("prtFrNivel"), motivo = prtTexto("prtFrMotivo");
  const erro = (texto) => { mostrarToast(texto, "erro"); prtAvisoForm("prtFrMsg", texto); };
  if (!nivelNovo || !prtNiveisAcima(prtDetalhe.incidente.nivel).some(n => n.codigo === nivelNovo)) { erro("Escolha o novo nível: só se pode aumentar a gravidade."); return; }
  if (motivo.length < 10 || motivo.length > 300 || prtTemMarca(motivo)) { erro("Explique por que o incidente é mais grave (de 10 a 300 caracteres, sem < ou >)."); return; }
  const corpo = { incidenteId: id, nivelNovo, motivo };
  if (nivelNovo === "ALEGACAO") {
    const quem = prtTexto("prtFrQuem"), relato = prtTexto("prtFrRelato");
    if (!quem) { erro("Informe quem contou ou percebeu o fato."); return; }
    if (relato.length < 10 || relato.length > 4000 || prtTemMarca(relato)) { erro("Registre o relato do jeito que foi contado (de 10 a 4000 caracteres, sem < ou >)."); return; }
    corpo.relatadoPor = quem; corpo.relato = relato;
  }
  const aviso = nivelNovo === "ALEGACAO"
    ? "Reclassificar como suspeita ou relato de violência? O prazo de 24 horas para comunicar o Conselho Tutelar começa agora; a pessoa envolvida, se for membro, sai das escalas com crianças por cautela; a liderança de proteção será avisada. Só se sobe de nível: depois não dá para voltar atrás."
    : `Aumentar a gravidade do incidente para "${prtRotuloNivel(nivelNovo)}"? Só se sobe de nível: depois não dá para voltar atrás.`;
  if (!(await confirmarAcao(aviso, "Reclassificar"))) return;
  await prtProtegerBotao(botao, async () => {
    const data = await prtPostar("reclassificar", corpo);
    if (id !== prtIncidenteAberto()) return;
    prtMostrarResultado(data, "prtFrMsg", false);
    if (data.sucesso === false) return;
    await prtDepoisDoAto(id, prtMsgErro(data));
  }, `reclassificar${id}`);
}
async function prtEnviarDecisaoAcao(envolvidoId, botao) {
  const id = prtIncidenteAberto(), eid = Number(envolvidoId);
  const envolvido = prtDetalhe ? (prtDetalhe.envolvidos || []).find(e => Number(e.envolvidoId) === eid) : null;
  if (!id || !envolvido) return;
  const decisao = prtTexto("prtFdDecisao"), observacao = prtTexto("prtFdObs");
  const erro = (texto) => { mostrarToast(texto, "erro"); prtAvisoForm("prtFdMsg", texto); };
  if (!decisao) { erro("Escolha a decisão: manter ou levantar o afastamento."); return; }
  // a observação é conferida ANTES de enviar: o servidor pede a confirmação reforçada (428) antes de olhar o texto, e ninguém deve confirmar a identidade à toa
  if (observacao.length < 10 || observacao.length > 300 || prtTemMarca(observacao)) { erro("Registre o motivo da decisão (de 10 a 300 caracteres, sem < ou >), sem citar o nome da criança."); return; }
  const efeito = decisao === "LIBERADO"
    ? "A pessoa só volta às escalas com crianças se a habilitação dela estiver em dia, e é avisada."
    : "A pessoa continua fora das escalas com crianças.";
  if (!(await confirmarAcao(`${prtRotuloDe(prtCatalogos.decisoes, decisao)} (${envolvido.nome})? ${efeito} A decisão fica registrada com o seu nome.`, "Registrar a decisão"))) return;
  await prtProtegerBotao(botao, async () => {
    const data = await prtPostar("cautelar-decidir", { incidenteId: id, envolvidoId: eid, decisao, observacao });   // 428: o fetchProtegido confirma e repete a chamada
    if (id !== prtIncidenteAberto()) return;
    prtMostrarResultado(data, "prtFdMsg", false);
    if (data.sucesso === false) return;
    await prtDepoisDoAto(id, prtMsgErro(data));
  }, `decisao${eid}`);
}
// Antes de pedir a confirmação de identidade (e de mostrar o "tem certeza"), vê se o caso pode mesmo encerrar: com a ficha desatualizada a pergunta seria à toa.
// Devolve a lista de motivos (vazia = pode encerrar). A ficha na tela não é refeita (o que a pessoa escreveu no formulário fica).
async function prtMotivosParaEncerrar(id) {
  const enc = prtDetalhe && prtDetalhe.encerramentoPossivel;
  if (enc && enc.ok === true) return [];
  const fresco = await prtObter(`incidente?incidenteId=${id}`);
  if (id !== prtIncidenteAberto()) return [];
  if (fresco.sucesso !== false && fresco.incidente) { prtDetalhe = fresco; }
  const atual = prtDetalhe && prtDetalhe.encerramentoPossivel;
  return atual && atual.ok === false && Array.isArray(atual.motivos) ? atual.motivos.map(m => String(m)) : [];
}
async function prtEnviarVinculoAcao(envolvidoId, botao) {
  const id = prtIncidenteAberto(), eid = Number(envolvidoId);
  const envolvido = prtDetalhe ? (prtDetalhe.envolvidos || []).find(e => Number(e.envolvidoId) === eid) : null;
  if (!id || !envolvido) return;
  const textoMatricula = prtTexto("prtFvMatricula"), membroId = prtInteiro(textoMatricula);
  const erro = (texto) => { mostrarToast(texto, "erro"); prtAvisoForm("prtFvMsg", texto); };
  if (!membroId) { erro("Informe a matrícula da pessoa (um número)."); return; }
  const suspeita = prtDetalhe.incidente.nivel === "ALEGACAO";
  const efeito = suspeita
    ? "Por ser uma suspeita de violência, a pessoa sai das escalas com crianças agora, por cautela (não é punição), e o Comitê precisa decidir sobre o afastamento."
    : "A pessoa passa a constar como envolvida neste incidente.";
  if (!(await confirmarAcao(`Vincular "${envolvido.nome}" à matrícula ${membroId}? ${efeito} O vínculo fica registrado com o seu nome e não se desfaz. Confira a matrícula.`, "Vincular"))) return;
  await prtProtegerBotao(botao, async () => {
    const data = await prtPostar("vincular-envolvido", { incidenteId: id, membroId });   // 428: o fetchProtegido confirma e repete a chamada
    if (id !== prtIncidenteAberto()) return;
    prtMostrarResultado(data, "prtFvMsg", false);
    if (data.sucesso === false) return;   // recusa de regra (matrícula que não existe, já vinculada...): mensagem do servidor e formulário aberto
    await prtDepoisDoAto(id, prtMsgErro(data));   // se a pessoa vinculada é quem está olhando, a ficha passa a responder 404 e a tela mostra só que não foi possível abrir
  }, `vincular${eid}`);
}
async function prtEnviarEncerramentoAcao(botao) {
  const id = prtIncidenteAberto();
  if (!id) return;
  const resultado = prtTexto("prtFeResultado"), providencia = prtTexto("prtFeProvidencia");
  const erro = (texto) => { mostrarToast(texto, "erro"); prtAvisoForm("prtFeMsg", texto); };
  if (!resultado) { erro("Escolha como o caso termina para a Igreja."); return; }
  if (providencia.length < 10 || providencia.length > 500 || prtTemMarca(providencia)) { erro("Escreva o que foi feito (de 10 a 500 caracteres, sem < ou >), sem citar o nome da criança."); return; }
  // "sem conteúdo de proteção" não exige comunicação ao órgão (é o que o torna diferente): quem decide se vale é o servidor, e o que falta para o encerramento comum não se aplica
  const arquivar = resultado === PRT_RESULTADO_SEM_CONTEUDO;
  const motivos = arquivar ? [] : await prtMotivosParaEncerrar(id);
  if (id !== prtIncidenteAberto()) return;
  if (motivos.length) { prtAvisoForm("prtFeMsg", `Ainda não dá para encerrar. ${motivos.join(" ")}`); return; }
  const aviso = arquivar
    ? `Arquivar o pedido ${prtDetalhe.incidente.protocolo} como "sem conteúdo de proteção"? Isto encerra o caso SEM comunicar ao Conselho Tutelar e só vale para teste, engano ou texto sem relato de violência. Todos os outros da Diretoria e do Comitê serão avisados. Se há qualquer relato de violência, cancele e comunique ao órgão.`
    : `Encerrar o caso ${prtDetalhe.incidente.protocolo}? O registro fica guardado, mas o caso sai da fila de abertos e não recebe mais comunicação, adendo nem reclassificação. Confira o que foi feito antes de confirmar.`;
  if (!(await confirmarAcao(aviso, arquivar ? "Arquivar o pedido" : "Encerrar o caso"))) return;
  await prtProtegerBotao(botao, async () => {
    const data = await prtPostar("encerrar", { incidenteId: id, resultado, providencia });   // 428: o fetchProtegido confirma e repete a chamada
    if (id !== prtIncidenteAberto()) return;
    // o servidor pode recusar mesmo assim (o caso mudou desde que a ficha abriu): o motivo dele aparece, com o formulário aberto
    if (data.sucesso === false) { prtMostrarResultado(data, "prtFeMsg", true); return; }
    prtMostrarResultado(data, "prtFeMsg", false);
    await prtDepoisDoAto(id, prtMsgErro(data));
  }, `encerrar${id}`);
}

// -- e) padrões de pequenas quebras (nível geral) --
async function prtCarregarPadroesAcao() {
  const lista = prtEl("prtPadroesLista");
  if (!lista) return;
  if (!prtEhGeral()) { lista.innerHTML = ""; prtEscreverAviso("prtPadroesResultado", "Esta área é da Diretoria Executiva e do Comitê de Proteção.", true); return; }
  const seq = ++prtSeqPadroes;
  prtEscreverAviso("prtPadroesResultado", "Carregando os padrões…", false);
  const data = await prtObter("padroes");
  if (seq !== prtSeqPadroes) return;
  if (data.sucesso === false || !Array.isArray(data.padroes)) { lista.innerHTML = ""; prtEscreverAviso("prtPadroesResultado", prtMsgErro(data), true); return; }
  prtEscreverAviso("prtPadroesResultado", "", false);
  lista.innerHTML = data.padroes.length
    ? data.padroes.map(p => {
      const ids = (Array.isArray(p.incidentes) ? p.incidentes : []).filter(x => prtInteiro(x));
      return `<div class="cal-cartao cartao-area-ebd prt-padrao">
        <h5>${p.tipo === "EQUIPE" ? "Equipe" : "Pessoa"}: ${escaparHtmlEbd(p.nome)} ${prtSelo("cal-st-proposto", `${Number(p.total) || 0} registros`)}</h5>
        <p class="psc-legenda">Incidentes: ${ids.map(x => `<button type="button" class="btn-link" data-on-click="prtAbrirDetalheDePadraoAcao" data-args-click="${argsAttr(Number(x))}">nº ${Number(x)}</button>`).join(" ")}</p>
      </div>`;
    }).join("")
    : "<p class='subtitle'>Nenhum padrão no momento: nenhuma equipe nem pessoa tem três ou mais registros de quase-acidente ou quebra de política nos últimos 90 dias.</p>";
}
// do padrão para a ficha do incidente: troca para a fila (sem recarregar a lista antes) e abre a ficha
function prtAbrirDetalheDePadraoAcao(incidenteId) {
  prtMostrarSecaoAcao("incidentes", true);
  prtCarregarIncidentesAcao();
  prtAbrirDetalheAcao(incidenteId);
}

// -- f) o Comitê de Proteção (nível geral) --
async function prtCarregarComiteAcao() {
  const lista = prtEl("prtComiteLista");
  if (!lista) return;
  if (!prtEhGeral()) { lista.innerHTML = ""; prtEscreverAviso("prtComiteResultado", "Esta área é da Diretoria Executiva e do Comitê de Proteção.", true); return; }
  const seq = ++prtSeqComite;
  prtEscreverAviso("prtComiteResultado", "Carregando o Comitê…", false);
  const data = await prtObter("comite");
  if (seq !== prtSeqComite) return;
  const c = data.comite && typeof data.comite === "object" ? data.comite : null;
  if (data.sucesso === false || !c) { lista.innerHTML = ""; prtEscreverAviso("prtComiteResultado", prtMsgErro(data), true); return; }
  prtEscreverAviso("prtComiteResultado", "", false);
  const membros = Array.isArray(c.membros) ? c.membros : [];
  const a = c.avaliacao && typeof c.avaliacao === "object" ? c.avaliacao : { total: membros.length, clericos: 0, leigos: 0, ok: false, problemas: [] };
  const problemas = Array.isArray(a.problemas) ? a.problemas : [];
  lista.innerHTML = `<div class="cal-cartao cartao-area-ebd">
    <h5>${a.ok ? prtSelo("cal-st-homologado", "✅ Comitê completo") : prtSelo("cal-st-indeferido", "⚠️ Comitê incompleto")}
      <span class="psc-legenda">${Number(a.total) || 0} membro(s): ${Number(a.clericos) || 0} do clero e ${Number(a.leigos) || 0} leigo(s)</span></h5>
    ${problemas.length ? `<ul class="prt-lista">${problemas.map(p => `<li>${escaparHtmlEbd(p)}</li>`).join("")}</ul>` : ""}
    ${membros.length ? `<ul class="prt-lista">${membros.map(m => `<li><strong>${escaparHtmlEbd(m.nome)}</strong> ${prtSelo(m.clerigo ? "cal-st-deferido" : "cal-st-cancelado", m.clerigo ? "clero" : "leigo")}</li>`).join("")}</ul>` : "<p class='subtitle'>Ninguém ocupa o papel do Comitê ainda.</p>"}
    <p class="psc-legenda">Quem entra no Comitê é cadastrado pelo papel «${escaparHtmlEbd(c.papel || "Comitê de Proteção")}» em Administração de Acesso → Permissões. Se é do clero ou leigo vem do cadastro da pessoa: não se digita aqui. O Comitê precisa de pelo menos 3 pessoas e de pelo menos uma que não seja do clero.</p>
  </div>`;
}

// -- g) relatório anual (nível geral) --
function prtPrepararRelatorio() {
  const sel = prtEl("prtRelAno");
  if (sel && !sel.options.length) {
    const atual = Number(calHojeBrasilia().slice(0, 4));
    const anos = [];
    for (let a = atual; a >= 2024; a--) anos.push(a);
    sel.innerHTML = prtOpcoes(anos, a => String(a), a => String(a));
    sel.value = String(atual);
  }
  prtCarregarRelatorioAcao();
}
async function prtCarregarRelatorioAcao() {
  const cx = prtEl("prtRelImprimivel");
  if (!cx) return;
  if (!prtEhGeral()) { cx.innerHTML = ""; prtEscreverAviso("prtRelResultado", "Esta área é da Diretoria Executiva e do Comitê de Proteção.", true); return; }
  const ano = prtInteiro(prtTexto("prtRelAno"));
  const seq = ++prtSeqRel;
  prtEscreverAviso("prtRelResultado", "Carregando o relatório…", false);
  const data = await prtObter(ano ? `relatorio-anual?ano=${ano}` : "relatorio-anual");
  if (seq !== prtSeqRel) return;
  const r = data.relatorio && typeof data.relatorio === "object" ? data.relatorio : null;
  if (data.sucesso === false || !r) { cx.innerHTML = ""; prtEscreverAviso("prtRelResultado", prtMsgErro(data), true); return; }
  prtEscreverAviso("prtRelResultado", "", false);
  const t = r.total && typeof r.total === "object" ? r.total : {};
  const porCong = Array.isArray(r.porCongregacao) ? r.porCongregacao : [];
  const hab = Array.isArray(r.habilitacaoPorCongregacao) ? r.habilitacaoPorCongregacao : [];
  const comite = r.comite && typeof r.comite === "object" ? r.comite : null;
  const av = comite && comite.avaliacao && typeof comite.avaliacao === "object" ? comite.avaliacao : null;
  const n = (v) => Number(v) || 0;
  const contador = (valor, rotulo, classe) => `<div class="prt-contador${classe}"><span class="prt-contador-valor">${n(valor)}</span><span class="prt-contador-rotulo">${escaparHtmlEbd(rotulo)}</span></div>`;
  const horas = (v) => (v == null || !Number.isFinite(Number(v)) ? "—" : `${Number(v)} h`);
  cx.innerHTML = `<h4>Relatório anual de proteção de crianças e adolescentes — ${Number(r.ano) || ano}</h4>
    <p class="psc-legenda">Gerado em ${prtDataHora(r.geradoEm)}. Só números: o relatório não traz nome de criança nem o conteúdo de relato.</p>
    <div class="prt-contadores">
      ${contador(t.quaseAcidentes, "Quase-acidentes", "")}
      ${contador(t.quebrasDePolitica, "Quebras de política", "")}
      ${contador(t.suspeitasDeViolencia, "Suspeitas ou relatos de violência", " prt-contador-alerta")}
      ${contador(t.abertos, "Ainda abertos", "")}
      ${contador(t.suspeitasComunicadasNoPrazo, "Suspeitas comunicadas no prazo de 24 h", " prt-contador-ok")}
      ${contador(t.suspeitasForaDoPrazoOuSemComunicacao, "Fora do prazo ou sem comunicação", " prt-contador-erro")}
      ${contador(t.afastamentosCautelaresAtivos, "Afastamentos cautelares ativos", "")}
    </div>
    ${av ? `<p>Comitê de Proteção: ${n(av.total)} membro(s), ${n(av.clericos)} do clero e ${n(av.leigos)} leigo(s) — ${av.ok ? "completo" : "incompleto"}.</p>` : ""}
    <h5>Por congregação</h5>
    ${porCong.length ? `<div class="prt-rolagem"><table class="tabela-frequencia prt-tabela"><thead><tr>
      <th scope="col">Congregação</th><th scope="col">Quase-acidentes</th><th scope="col">Quebras de política</th><th scope="col">Suspeitas de violência</th><th scope="col">Abertos</th>
      <th scope="col">Comunicadas no prazo</th><th scope="col">Fora do prazo ou sem comunicação</th><th scope="col">Média até comunicar</th></tr></thead><tbody>
      ${porCong.map(l => `<tr><td>${escaparHtmlEbd(l.congregacaoNome)}</td><td>${n(l.quaseAcidentes)}</td><td>${n(l.quebrasDePolitica)}</td><td>${n(l.suspeitasDeViolencia)}</td><td>${n(l.abertos)}</td>
        <td>${n(l.suspeitasComunicadasNoPrazo)}</td><td>${n(l.suspeitasForaDoPrazoOuSemComunicacao)}</td><td>${horas(l.horasMediasAteComunicar)}</td></tr>`).join("")}
      </tbody></table></div>` : "<p class='subtitle'>Nenhum incidente registrado neste ano.</p>"}
    ${hab.length ? `<h5>Habilitação de quem serve com crianças, por congregação</h5><div class="prt-rolagem"><table class="tabela-frequencia prt-tabela"><thead><tr>
      <th scope="col">Congregação</th><th scope="col">Voluntários</th><th scope="col">Aptos</th><th scope="col">Vencendo</th><th scope="col">Bloqueados</th></tr></thead><tbody>
      ${hab.map(l => `<tr><td>${escaparHtmlEbd(l.congregacaoNome)}</td><td>${n(l.total)}</td><td>${n(l.aptos)}</td><td>${n(l.vencendo)}</td><td>${n(l.bloqueados)}</td></tr>`).join("")}
      </tbody></table></div>` : ""}`;
}
// Imprime só o relatório: a classe que esconde o resto da página existe apenas durante a impressão (CSS @media print, app/style.css)
function prtImprimirRelatorioAcao() {
  const classes = document.body && document.body.classList;
  if (classes) classes.add("prt-imprimindo");
  try { window.print(); } finally { if (classes) classes.remove("prt-imprimindo"); }
}

registrarAcoes({
  prtAbrirAjudaPublicaAcao, prtAbrirDetalheAcao, prtAbrirDetalheDePadraoAcao, prtAbrirFormAcao, prtAtualizarDetalheAcao, prtCarregarComiteAcao, prtCarregarIncidentesAcao, prtCarregarMeusAcao,
  prtCarregarPadroesAcao, prtCarregarRelatorioAcao, prtContarAcao, prtEnviarAdendoAcao, prtEnviarAjudaAcao, prtEnviarComunicacaoAcao, prtEnviarDecisaoAcao, prtEnviarEncerramentoAcao,
  prtEnviarReclassificacaoAcao, prtEnviarRegistroAcao, prtFecharAjudaPublicaAcao, prtFecharDetalheAcao, prtFecharFormAcao, prtFecharRelatoAcao, prtImprimirRelatorioAcao, prtLerRelatoAcao,
  prtMostrarSecaoAcao, prtMudouCongregacaoAcao, prtMudouNivelAcao, prtMudouNivelReclassAcao, prtMudouResultadoAcao, prtEnviarVinculoAcao, prtEscolherMembroVinculoAcao
});
