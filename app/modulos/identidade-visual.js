// app/modulos/identidade-visual.js — v7.14: Identidade Visual Anual (Regimento Art. 159 § 1º; Art. 126-Q, II — só o nível Geral define a identidade).
// Decisões do responsável: 22/10/2026 — a Secretaria cadastra os temas já usados; vota todo membro apto e em comunhão pelo Meu Painel; pedidos de uniforme ficam na aba Camisetas
// do site. 23/10/2026 — o ciclo do ano é aberto pela Diretoria (sem ciclo aberto, a tela não mostra etapa nenhuma).
// Script clássico, carregado pelo index.html DEPOIS do script.js e do eventos.js: compartilha o escopo global com eles. Todos os nomes de nível superior começam com "idv"/"IDV_".
//
// Duas telas sobre a rota GestaoIdentidadeVisual (/api/identidade-visual/*) — o voto vai pela rota das Enquetes (/api/enquetes/{id}/votar):
//   1) Meu Painel → Identidade Visual (qualquer login, inclusive PIN): a etapa do ano com as datas; mandar e retirar sugestões (01–15/nov); votar (22–30/nov); ver as cores
//      e mandar a arte (dezembro); a identidade escolhida;
//   2) aba "Identidade Visual" (permissão identidade_visual, nível Geral, sessão de liderança): abrir o ciclo, triagem (finalista com ajuste guardando a original, ou descarte pelo
//      critério do Art. 159), votação (abre sozinha no dia 22; botão se atrasou), desempate, cores, artes, o resultado do culto e os Temas já usados.
// Toda regra mora no servidor (shared/identidadeVisual.js e shared/identidadeVisualDb.js): aqui só se monta o que ele devolve. 422 = recusa de regra, mostrada tal qual; 404 = a
// MESMA resposta para "não existe" e "não é seu"; 428 = confirmação reforçada da vD.4 (confirmarFatorAgora, e a chamada repetida uma vez).
// Tudo o que vem do servidor e entra em innerHTML passa por escaparHtmlEbd; id de elemento e argumento de ação levam só número inteiro ou código validado aqui; a cor só entra no
// estilo depois de conferida (#RRGGBB) e o endereço da imagem só por urlSegura.
const IDV_ROTA = "identidade-visual";
const IDV_TEMPO_LIMITE_MS = 20000;
const IDV_MSG_FATOR = "Este ato precisa de uma confirmação recente de quem você é (chave de acesso ou código por e-mail). Tente de novo e confirme quando a tela pedir.";
const IDV_MSG_TEMPO = "Não foi possível falar com o servidor a tempo (20 segundos sem resposta). Verifique a internet e tente de novo.";
const IDV_MSG_REDE = "Não foi possível falar com o servidor agora. Verifique a internet e tente de novo.";
const IDV_FASES = ["SUGESTAO", "TRIAGEM", "VOTACAO", "ARTE", "ENCERRADO"];
const IDV_ROTULO_FASE = { AGUARDANDO: "Aguardando o início", SUGESTAO: "Sugestões de temas", TRIAGEM: "Triagem da Diretoria", VOTACAO: "Votação do tema", ARTE: "Cores e concurso de arte", ENCERRADO: "Encerrado" };
const IDV_ROTULO_SUGESTAO = { ENVIADA: "Em análise", RETIRADA: "Retirada por você", FINALISTA: "Finalista", DESCARTADA: "Não foi à votação" };
const IDV_ROTULO_SUGESTAO_GESTAO = { ENVIADA: "Aguardando a triagem", FINALISTA: "Finalista", DESCARTADA: "Descartada" };
const IDV_ROTULO_ARTE = { ENVIADA: "No concurso", RETIRADA: "Retirada", RECUSADA: "Fora do concurso", ESCOLHIDA: "Escolhida no culto" };
const IDV_ROTULO_APURACAO = { VENCEDOR: "Tema escolhido na votação", EMPATE: "Empate: a Diretoria decide", SEM_VOTOS: "Ninguém votou: a Diretoria decide", NAO_VOTADA: "Sem votação: tema definido pela Diretoria" };
const IDV_TIPOS_IMAGEM = ["image/png", "image/jpeg"];
const IDV_HEX = /^#[0-9A-F]{6}$/;

let idvDono = null;
let idvCat = null;
let idvGeracao = 0, idvGerMeu = 0, idvGerGes = 0;
let idvSeqMeu = 0, idvSeqGes = 0, idvSeqCiclo = 0;
let idvMeu = null;                  // GET meu
let idvPainel = null;               // GET painel
let idvDetalhe = null;              // GET ciclo
let idvCicloSel = null;
let idvSecaoAtual = "ciclo";
const idvEmCurso = new Set();

function idvEl(id) { return document.getElementById(id); }
function idvValor(id) { const c = idvEl(id); return c ? String(c.value == null ? "" : c.value).trim() : ""; }
function idvInteiro(v) { const n = Number(v); return Number.isInteger(n) && n >= 1 ? n : 0; }
function idvMsgErro(data) { return (data && data.mensagem) || "Não foi possível concluir a operação agora."; }
function idvEscrever(id, texto, destaque) { const el = idvEl(id); if (el) { el.textContent = texto; el.className = destaque ? "subtitle psc-aviso" : "subtitle"; } }
function idvMostrar(id, visivel) { const el = idvEl(id); if (el) el.style.display = visivel ? "block" : "none"; }
// As pílulas Ciclo / Temas só aparecem para quem o servidor confirmou ser da Diretoria (sem acesso, enquanto carrega ou na falha, elas não fazem nada: ficam escondidas).
function idvMostrarPilulas(visivel) { const el = idvEl("idvPilulas"); if (el) el.style.display = visivel ? "" : "none"; }
function idvData(v) { return escaparHtmlEbd(typeof calData === "function" ? calData(v) : String(v || "")); }
function idvDataHora(v) { return escaparHtmlEbd(typeof calDataHora === "function" ? calDataHora(v) : String(v || "")); }
function idvCor(hex) { const h = String(hex || "").toUpperCase(); return IDV_HEX.test(h) ? h : null; }
function idvMarca(ctx) { return { ctx, g: idvGeracao, t: ctx === "Meu" ? idvGerMeu : idvGerGes }; }
function idvViva(m) { return !!m && m.g === idvGeracao && (m.ctx === "Meu" ? m.t === idvGerMeu && idvMeuVisivel() : m.t === idvGerGes && idvAbaVisivel()); }
async function idvProteger(botao, tarefa, chave) {
  if (chave) {
    if (idvEmCurso.has(chave)) { mostrarToast("Aguarde: o pedido anterior ainda está sendo processado.", "erro"); return undefined; }
    idvEmCurso.add(chave);
  }
  if (botao && typeof botao === "object") botao.disabled = true;
  try { return await tarefa(); } finally {
    if (botao && typeof botao === "object") botao.disabled = false;
    if (chave) idvEmCurso.delete(chave);
  }
}

// ---- falar com o servidor ----
async function idvTentar(url, opcoes) {
  const controle = typeof AbortController === "function" ? new AbortController() : null;
  const limite = controle ? setTimeout(() => controle.abort(), IDV_TEMPO_LIMITE_MS) : null;
  try {
    const res = await fetchProtegido(url, Object.assign({}, opcoes || {}, { semFator: true }, controle ? { signal: controle.signal } : {}));
    let corpo = null;
    try { corpo = await res.json(); } catch { corpo = null; }
    return { res, corpo };
  } finally { if (limite != null) clearTimeout(limite); }
}
async function idvRequisitarUrl(url, opcoes) {
  try {
    let r = await idvTentar(url, opcoes);
    if (r.res.status === 428) { const ok = await confirmarFatorAgora(); if (ok) r = await idvTentar(url, opcoes); }
    const { res, corpo } = r;
    if (!corpo || typeof corpo !== "object" || Array.isArray(corpo)) return { sucesso: false, mensagem: `Resposta inesperada do servidor (${res.status}).`, httpStatus: res.status };
    if (res.status >= 400) corpo.sucesso = false;
    if (res.status === 428 || corpo.precisaFator) corpo.mensagem = IDV_MSG_FATOR;
    corpo.httpStatus = res.status;
    if (res.status === 403 || res.status >= 500) corpo.jaAvisado = true;
    return corpo;
  } catch (e) {
    if (e && e.message === "Sessão expirada") return { sucesso: false, jaAvisado: true, mensagem: "Sua sessão expirou. Entre novamente." };
    if (e && e.name === "AbortError") return { sucesso: false, jaAvisado: true, falhaDeRede: true, tempoEsgotado: true, mensagem: IDV_MSG_TEMPO };
    return { sucesso: false, jaAvisado: true, falhaDeRede: true, mensagem: IDV_MSG_REDE };
  }
}
function idvObter(caminho) { return idvRequisitarUrl(`${API_BASE}/${IDV_ROTA}/${caminho}`); }
function idvPostar(caminho, corpo) { return idvRequisitarUrl(`${API_BASE}/${IDV_ROTA}/${caminho}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo) }); }
function idvMostrarResultado(data, idMensagem) {
  const texto = idvMsgErro(data);
  const falhou = !!(data && data.sucesso === false);
  if (!(data && data.jaAvisado)) mostrarToast(texto, falhou ? "erro" : "sucesso");
  idvEscrever(idMensagem, texto, falhou);
}
async function idvGarantirCatalogos(forcar) {
  if (idvCat && !forcar) return idvCat;
  const geracao = idvGeracao;
  const data = await idvObter("catalogos");
  if (geracao !== idvGeracao) return idvCat;
  if (data.sucesso === false) return idvCat;
  const papeis = data.papeis && typeof data.papeis === "object" ? data.papeis : {};
  const lista = (v) => (Array.isArray(v) ? v : []);
  idvCat = { gestao: !!papeis.gestao, criterios: lista(data.criterios).filter(c => c && idvInteiro(c.codigo) && idvInteiro(c.codigo) <= 3),
    ocasioes: lista(data.ocasioes).filter(o => o && /^[A-Z_]{2,30}$/.test(String(o.codigo))), limites: data.limites && typeof data.limites === "object" ? data.limites : {} };
  return idvCat;
}

// ---- troca de login e saída da tela: nada da pessoa anterior fica na página ----
function idvFecharMeu() {
  idvGerMeu++; idvSeqMeu++;
  idvMeu = null;
  const el = idvEl("idvMeuConteudo"); if (el) el.innerHTML = "";
  idvEscrever("idvMeuMsg", "", false);
}
function idvFecharGestao() {
  idvGerGes++; idvSeqGes++; idvSeqCiclo++;
  idvPainel = null; idvDetalhe = null;
  ["idvPainelTopo", "idvCicloDetalhe", "idvTemasForm", "idvTemasLista"].forEach(id => { const el = idvEl(id); if (el) el.innerHTML = ""; });
  ["idvGesMsg", "idvCicloMsg", "idvTemasMsg"].forEach(id => idvEscrever(id, "", false));
}
function idvLimparTela() {
  idvGeracao++;
  idvFecharMeu(); idvFecharGestao();
  idvCat = null; idvCicloSel = null; idvSecaoAtual = "ciclo"; idvEmCurso.clear();
  idvMostrar("idvSemAcesso", false); idvMostrarPilulas(false);
  idvAplicarSecao("ciclo");
}
function idvChaveDoDono() { return `${authMatricula}|${sessaoDeLiderancaNaTela() ? "senha" : "pin"}`; }
function idvVerificarDono() { if (idvDono !== idvChaveDoDono()) { idvLimparTela(); idvDono = idvChaveDoDono(); } }
function idvAbaMudou(aba) {
  if (aba !== "identidade") idvFecharGestao();
  if (aba !== "meupainel") idvFecharMeu();
}
function idvSubAbaMudou(sub) { if (sub !== "identidade") idvFecharMeu(); }
function idvAbaVisivel() { const a = idvEl("abaIdentidade"); return !!(authToken && idvDono === idvChaveDoDono() && a && a.style.display === "block"); }
function idvMeuVisivel() { const s = idvEl("subMeupainelIdentidade"); return !!(authToken && idvDono === idvChaveDoDono() && s && s.style.display === "block"); }

// ---- peças comuns ----
// A linha do tempo do ano, com as datas de cada etapa e a de hoje destacada.
function idvLinhaDoTempo(ciclo) {
  const c = ciclo && ciclo.calendario ? ciclo.calendario : null;
  if (!c) return "";
  const periodo = { SUGESTAO: c.sugestao, TRIAGEM: c.triagem, VOTACAO: c.votacao, ARTE: c.arte };
  return `<ol class="idv-linha">${IDV_FASES.map(f => {
    const p = periodo[f];
    const quando = p ? `${idvData(p.inicio)} a ${idvData(p.fim)}` : "depois do culto (até 31/12)";
    return `<li class="${f === ciclo.fase ? "idv-atual" : ""}"><strong>${escaparHtmlEbd(IDV_ROTULO_FASE[f])}</strong><span>${quando}</span></li>`;
  }).join("")}</ol>`;
}
function idvAmostra(cor) {
  const hex = idvCor(cor && cor.hex);
  if (!hex) return "";
  return `<span class="idv-cor"><span class="idv-amostra" style="background:${escaparHtmlEbd(hex)}"></span>${escaparHtmlEbd(cor.nome)} <code>${escaparHtmlEbd(hex)}</code></span>`;
}
function idvContagem(votacao) {
  if (!votacao || !Array.isArray(votacao.opcoes) || !votacao.opcoes.some(o => typeof o.votos === "number")) return "";
  const total = votacao.opcoes.reduce((s, o) => s + (Number(o.votos) || 0), 0);
  return `<ul class="idv-contagem">${votacao.opcoes.map(o => `<li>${escaparHtmlEbd(o.texto)}: <strong>${Number(o.votos) || 0}</strong> voto(s)</li>`).join("")}</ul>
    <p class="subtitle">Total: ${Number(total)} voto(s).</p>`;
}

// ============================================================================
// MEU PAINEL → IDENTIDADE VISUAL
// ============================================================================
async function idvCarregarMeuPainelAcao() {
  idvVerificarDono();
  const marca = idvMarca("Meu");
  if (!idvViva(marca)) return;
  const seq = ++idvSeqMeu;
  idvEscrever("idvMeuMsg", "Carregando…", false);
  const data = await idvObter("meu");
  if (seq !== idvSeqMeu || !idvViva(marca)) return;
  if (data.sucesso === false) { idvEscrever("idvMeuMsg", idvMsgErro(data), true); return; }
  idvEscrever("idvMeuMsg", "", false);
  idvMeu = data;
  idvPintarMeu();
}
function idvPintarMeu() {
  const cx = idvEl("idvMeuConteudo");
  if (!cx || !idvMeu) return;
  const d = idvMeu;
  const vigente = d.identidadeVigente ? `<p class="idv-vigente">🎨 Identidade visual de ${Number(d.identidadeVigente.ano)}: <strong>${escaparHtmlEbd(d.identidadeVigente.tema)}</strong></p>` : "";
  const c = d.ciclo;
  if (!c) {
    cx.innerHTML = `${vigente}<p class="subtitle">O processo de escolha da identidade visual de ${Number(d.proximoAno)} ainda não foi aberto pela Diretoria. Quando abrir, as sugestões de tema
      vão de ${idvData(d.calendarioProximo && d.calendarioProximo.sugestao.inicio)} a ${idvData(d.calendarioProximo && d.calendarioProximo.sugestao.fim)}, aqui mesmo.</p>`;
    return;
  }
  const apto = d.apto ? "" : `<p class="subtitle psc-aviso">Só quem é membro ativo e em comunhão participa da escolha (Regimento, Art. 159). Se acha que é engano, fale com a Secretaria.</p>`;
  let corpo = "";
  if (c.fase === "AGUARDANDO") corpo = `<p class="subtitle">As sugestões abrem em ${idvData(c.calendario.sugestao.inicio)}.</p>`;
  if (c.fase === "SUGESTAO") corpo = idvPintarSugestaoMembro(d);
  if (c.fase === "TRIAGEM") corpo = `<p class="subtitle">A Diretoria está escolhendo os finalistas (até ${idvData(c.calendario.triagem.fim)}). A votação começa em ${idvData(c.calendario.votacao.inicio)}.</p>${idvMinhasSugestoes(d, false)}`;
  if (c.fase === "VOTACAO") corpo = idvPintarVotacaoMembro(d) + idvMinhasSugestoes(d, false);
  if (c.fase === "ARTE") corpo = idvPintarTemaDefinido(d) + idvPintarArteMembro(d);
  if (c.fase === "ENCERRADO") corpo = idvPintarEncerrado(d);
  cx.innerHTML = `${vigente}
    <section class="idv-cartao"><h4>Identidade visual de ${Number(c.anoAlvo)} — ${escaparHtmlEbd(IDV_ROTULO_FASE[c.fase] || c.fase)}</h4>${idvLinhaDoTempo(c)}</section>
    ${apto}${corpo}`;
  if (c.fase === "ENCERRADO" && d.resultado && idvInteiro(d.resultado.arteId)) idvMostrarImagem(idvInteiro(d.resultado.arteId), "idvArteEscolhida", idvMarca("Meu"));
}
function idvMinhasSugestoes(d, comRetirar) {
  const lista = Array.isArray(d.minhasSugestoes) ? d.minhasSugestoes : [];
  if (!lista.length) return `<p class="subtitle">Você não mandou sugestão neste ano.</p>`;
  return `<h4>Suas sugestões</h4><ul class="idv-lista">${lista.map(s => {
    const id = idvInteiro(s.sugestaoId);
    const naVotacao = s.textoNaVotacao && s.textoNaVotacao !== s.texto ? `<br><span class="subtitle">Na votação, com a redação ajustada pela Diretoria: "${escaparHtmlEbd(s.textoNaVotacao)}"</span>` : "";
    const botao = comRetirar && s.situacao === "ENVIADA" && id ? ` <button type="button" class="btn-link btn-link-perigo" data-on-click="idvRetirarSugestaoAcao" data-args-click="${argsAttr(id, ARG.elemento)}">Retirar</button>` : "";
    return `<li><strong>${escaparHtmlEbd(s.texto)}</strong> — ${escaparHtmlEbd(IDV_ROTULO_SUGESTAO[s.situacao] || s.situacao)}${botao}${naVotacao}</li>`;
  }).join("")}</ul>`;
}
function idvPintarSugestaoMembro(d) {
  const ativas = (Array.isArray(d.minhasSugestoes) ? d.minhasSugestoes : []).filter(s => s.situacao !== "RETIRADA").length;
  const max = Number(d.maxSugestoes) || 3;
  const form = !d.apto ? "" : ativas >= max
    ? `<p class="subtitle">Você já mandou ${Number(max)} sugestões (o máximo). Para mandar outra, retire uma das suas.</p>`
    : `<label for="idvSugestaoTexto">Seu tema (frase curta, até ${Number(d.maxTexto) || 80} letras)</label>
      <input type="text" id="idvSugestaoTexto" maxlength="${Number(d.maxTexto) || 80}" autocomplete="off" placeholder="Ex.: Raízes profundas, frutos abundantes">
      <div class="psc-acoes"><button type="button" class="btn-confirmar" data-on-click="idvSugerirAcao" data-args-click="${argsAttr(ARG.elemento)}">📨 Mandar sugestão</button></div>`;
  return `<section class="idv-cartao"><h4>Mande a sua sugestão de tema (até ${idvData(d.ciclo.calendario.sugestao.fim)})</h4>
    <p class="subtitle">Cada membro manda até ${Number(max)} sugestões. Para valer, o tema precisa ser <strong>curto e memorável</strong>, <strong>amplo</strong> (servir para Jovens,
      Senhoras e Missões) e <strong>original</strong>: tema já usado pela Igreja desde 2006 não é aceito. Você pode retirar a sua até o dia 15.</p>
    ${form}</section>${idvMinhasSugestoes(d, true)}`;
}
function idvPintarVotacaoMembro(d) {
  const v = d.votacao;
  if (!v) return `<section class="idv-cartao"><p class="subtitle">A votação ainda não abriu: a Diretoria está terminando a lista de finalistas.</p></section>`;
  if (!v.aberta) return `<section class="idv-cartao"><p class="subtitle">A votação terminou.</p>${idvContagem(v)}</section>`;
  if (v.jaVotou) return `<section class="idv-cartao"><p class="subtitle">✅ Você já votou${v.votouEm ? ` (${idvDataHora(v.votouEm)})` : ""}. O resultado sai depois do dia ${idvData(d.ciclo.calendario.votacao.fim)}.</p></section>`;
  if (!d.apto) return `<section class="idv-cartao"><p class="subtitle">A votação está aberta para os membros ativos e em comunhão.</p></section>`;
  const opcoes = (Array.isArray(v.opcoes) ? v.opcoes : []).filter(o => idvInteiro(o.opcaoId));
  return `<section class="idv-cartao"><h4>Vote no tema de ${Number(d.ciclo.anoAlvo)} (até ${idvData(d.ciclo.calendario.votacao.fim)})</h4>
    <p class="subtitle">Um voto por pessoa; o voto é secreto e não se muda depois.</p>
    <fieldset class="idv-opcoes"><legend>Finalistas</legend>${opcoes.map(o => `<label class="idv-opcao"><input type="radio" name="idvVoto" id="idvVoto_${idvInteiro(o.opcaoId)}"> ${escaparHtmlEbd(o.texto)}</label>`).join("")}</fieldset>
    <div class="psc-acoes"><button type="button" class="btn-confirmar" data-on-click="idvVotarAcao" data-args-click="${argsAttr(ARG.elemento)}">🗳️ Votar</button></div></section>`;
}
function idvPintarTemaDefinido(d) {
  const c = d.ciclo;
  const tema = c.tema ? `<p class="idv-tema">Tema de ${Number(c.anoAlvo)}: <strong>${escaparHtmlEbd(c.tema.texto)}</strong></p>`
    : `<p class="subtitle">${escaparHtmlEbd(IDV_ROTULO_APURACAO[c.apuracao] || "A votação está sendo apurada.")}</p>`;
  return `<section class="idv-cartao">${tema}${idvContagem(d.votacao)}</section>`;
}
function idvPintarArteMembro(d) {
  const cores = Array.isArray(d.cores) ? d.cores : [];
  const minhas = Array.isArray(d.minhasArtes) ? d.minhasArtes : [];
  const ativas = minhas.filter(a => a.situacao === "ENVIADA" || a.situacao === "ESCOLHIDA").length;
  const max = Number(d.maxArtes) || 3;
  const coresHtml = cores.length ? `<p class="subtitle">As cores do ano (a arte é feita com elas):</p><div class="idv-cores">${cores.map(idvAmostra).join("")}</div>`
    : `<p class="subtitle">A Diretoria ainda não registrou as cores do ano. O envio da arte abre quando elas estiverem aqui.</p>`;
  const form = !d.apto || !cores.length ? "" : ativas >= max ? `<p class="subtitle">Você já mandou ${Number(max)} artes (o máximo).</p>`
    : `<label for="idvArteArquivo">Imagem da arte (PNG ou JPEG, até 5 MB)</label><input type="file" id="idvArteArquivo" accept="image/png,image/jpeg">
      <label for="idvArteTitulo">Título (opcional)</label><input type="text" id="idvArteTitulo" maxlength="80" autocomplete="off">
      <label for="idvArteDescricao">Descrição (opcional)</label><textarea id="idvArteDescricao" maxlength="300" rows="2"></textarea>
      <div class="psc-acoes"><button type="button" class="btn-confirmar" data-on-click="idvEnviarArteAcao" data-args-click="${argsAttr(ARG.elemento)}">🖼️ Mandar a arte</button></div>`;
  const lista = minhas.length ? `<h4>Suas artes</h4><ul class="idv-lista">${minhas.map(a => {
    const id = idvInteiro(a.arteId);
    if (!id) return "";
    const ver = a.temImagem ? ` <button type="button" class="btn-link" data-on-click="idvVerImagemAcao" data-args-click="${argsAttr(id, "Meu", ARG.elemento)}">Ver</button>` : "";
    const retirar = a.situacao === "ENVIADA" && a.podeRetirar === true ? ` <button type="button" class="btn-link btn-link-perigo" data-on-click="idvRetirarArteAcao" data-args-click="${argsAttr(id, ARG.elemento)}">Retirar</button>` : "";
    const motivo = a.situacao === "RECUSADA" && a.motivoRecusa ? `<br><span class="subtitle">Motivo: ${escaparHtmlEbd(a.motivoRecusa)}</span>` : "";
    return `<li><strong>${escaparHtmlEbd(a.titulo || "Sem título")}</strong> — ${escaparHtmlEbd(IDV_ROTULO_ARTE[a.situacao] || a.situacao)} (${idvData(a.enviadaEm)})${ver}${retirar}${motivo}<div id="idvImg_${id}"></div></li>`;
  }).join("")}</ul>` : "";
  const ate = d.retiradaDeArteAte ? `<p class="subtitle">Você pode retirar a sua arte até ${idvData(d.retiradaDeArteAte)}; depois disso ela fica no concurso.</p>` : "";
  return `<section class="idv-cartao"><h4>Concurso de arte (dezembro)</h4>${ate}
    <p class="subtitle">Qualquer membro pode mandar a arte da camiseta do ano, com o tema escolhido e nas cores da Diretoria (Art. 159, § 1º, IV). A escolha final — arte e cor —
      é no culto de dezembro, por maioria dos presentes.</p>${coresHtml}${form}</section>${lista}`;
}
function idvPintarEncerrado(d) {
  const r = d.resultado;
  if (!r) return `${idvPintarTemaDefinido(d)}<p class="subtitle">O resultado da escolha final ainda não foi registrado pela Diretoria.</p>`;
  return `<section class="idv-cartao idv-resultado"><h4>Identidade Visual oficial de ${Number(d.ciclo.anoAlvo)}</h4>
    <p class="idv-tema"><strong>${escaparHtmlEbd(r.tema)}</strong></p>
    <p>Cor: ${idvAmostra(r.cor)}</p>
    <p class="subtitle">Escolhida em ${idvData(r.dataCulto)} (${escaparHtmlEbd(r.ocasiaoRotulo || r.ocasiao)}), com ${Number(r.votosVencedor)} voto(s)${r.presentes != null ? ` de ${Number(r.presentes)} presentes` : ""}.</p>
    <div id="idvArteEscolhida"></div></section>`;
}

async function idvSugerirAcao(botao) {
  if (!idvMeu || !idvMeuVisivel()) return;
  const texto = idvValor("idvSugestaoTexto");
  if (!texto) { idvEscrever("idvMeuMsg", "Escreva o tema antes de mandar.", true); return; }
  const marca = idvMarca("Meu");
  await idvProteger(botao, async () => {
    const data = await idvPostar("sugerir", { texto });
    if (!idvViva(marca)) return;
    idvMostrarResultado(data, "idvMeuMsg");
    if (data.sucesso !== false) { const campo = idvEl("idvSugestaoTexto"); if (campo) campo.value = ""; await idvRecarregarMeu(data, marca); }
  }, "sugerir");
}
// Relê o Meu Painel e deixa a mensagem do ato escrita.
async function idvRecarregarMeu(data, marca) {
  await idvCarregarMeuPainelAcao();
  if (idvViva(marca)) idvEscrever("idvMeuMsg", idvMsgErro(data), data.sucesso === false);
}
async function idvRetirarSugestaoAcao(sugestaoId, botao) {
  const id = idvInteiro(sugestaoId);
  if (!id || !idvMeuVisivel()) return;
  if (!(await confirmarAcao("Retirar esta sugestão? Ela sai da lista da triagem.", "Retirar"))) return;
  const marca = idvMarca("Meu");
  await idvProteger(botao, async () => {
    const data = await idvPostar("retirar-sugestao", { sugestaoId: id });
    if (!idvViva(marca)) return;
    idvMostrarResultado(data, "idvMeuMsg");
    await idvRecarregarMeu(data, marca);
  }, `retirar-${id}`);
}
async function idvVotarAcao(botao) {
  const v = idvMeu && idvMeu.votacao;
  if (!v || !idvMeuVisivel()) return;
  const enqueteId = idvInteiro(v.enqueteId), perguntaId = idvInteiro(v.perguntaId);
  const escolhida = (Array.isArray(v.opcoes) ? v.opcoes : []).find(o => { const el = idvEl(`idvVoto_${idvInteiro(o.opcaoId)}`); return el && el.checked; });
  if (!escolhida) { idvEscrever("idvMeuMsg", "Escolha um dos temas antes de votar.", true); return; }
  if (!enqueteId || !perguntaId) return;
  if (!(await confirmarAcao(`Confirmar o voto em "${escolhida.texto}"? O voto não se muda depois.`, "Votar"))) return;
  const marca = idvMarca("Meu");
  await idvProteger(botao, async () => {
    const data = await idvRequisitarUrl(`${API_BASE}/enquetes/${enqueteId}/votar`, { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ respostas: [{ perguntaId, opcaoId: idvInteiro(escolhida.opcaoId) }] }) });
    if (!idvViva(marca)) return;
    idvMostrarResultado(data.sucesso === false ? data : { sucesso: true, mensagem: "Voto registrado. Obrigado por participar!" }, "idvMeuMsg");
    await idvRecarregarMeu(data.sucesso === false ? data : { sucesso: true, mensagem: "Voto registrado. Obrigado por participar!" }, marca);
  }, "votar");
}
// Lê o arquivo como base64 (sem o cabeçalho "data:"), em pedaços (uma imagem de 5 MB não cabe num String.fromCharCode só).
async function idvBase64(arquivo) {
  const bytes = new Uint8Array(await arquivo.arrayBuffer());
  let binario = "";
  for (let i = 0; i < bytes.length; i += 32768) binario += String.fromCharCode.apply(null, bytes.subarray(i, i + 32768));
  return btoa(binario);
}
async function idvEnviarArteAcao(botao) {
  if (!idvMeu || !idvMeuVisivel()) return;
  const campo = idvEl("idvArteArquivo");
  const arquivo = campo && campo.files && campo.files[0];
  const max = Number(idvMeu.maxImagemBytes) || 5 * 1024 * 1024;
  if (!arquivo) { idvEscrever("idvMeuMsg", "Escolha a imagem da arte.", true); return; }
  if (!IDV_TIPOS_IMAGEM.includes(arquivo.type)) { idvEscrever("idvMeuMsg", "A arte tem de ser uma imagem PNG ou JPEG.", true); return; }
  if (!(arquivo.size > 0) || arquivo.size > max) { idvEscrever("idvMeuMsg", "A imagem passa de 5 MB (ou está vazia): diminua o tamanho e tente de novo.", true); return; }
  const marca = idvMarca("Meu");
  await idvProteger(botao, async () => {
    let imagemBase64;
    try { imagemBase64 = await idvBase64(arquivo); } catch (e) { idvEscrever("idvMeuMsg", "Não foi possível ler a imagem. Escolha o arquivo de novo.", true); return; }
    if (!idvViva(marca)) return;
    const data = await idvPostar("arte", { imagemBase64, tipo: arquivo.type, titulo: idvValor("idvArteTitulo"), descricao: idvValor("idvArteDescricao") });
    if (!idvViva(marca)) return;
    idvMostrarResultado(data, "idvMeuMsg");
    if (data.sucesso !== false) await idvRecarregarMeu(data, marca);
  }, "arte");
}
async function idvRetirarArteAcao(arteId, botao) {
  const id = idvInteiro(arteId);
  if (!id || !idvMeuVisivel()) return;
  if (!(await confirmarAcao("Retirar esta arte do concurso? A imagem é apagada.", "Retirar"))) return;
  const marca = idvMarca("Meu");
  await idvProteger(botao, async () => {
    const data = await idvPostar("retirar-arte", { arteId: id });
    if (!idvViva(marca)) return;
    idvMostrarResultado(data, "idvMeuMsg");
    await idvRecarregarMeu(data, marca);
  }, `retirar-arte-${id}`);
}
// A imagem vem por um endereço assinado (vale 1 hora), pedido na hora; entra só por urlSegura.
async function idvMostrarImagem(arteId, destino, marca) {
  const data = await idvObter(`imagem?arteId=${idvInteiro(arteId)}`);
  if (!idvViva(marca)) return;
  const el = idvEl(destino);
  if (!el) return;
  if (data.sucesso === false || typeof data.url !== "string") { el.innerHTML = `<p class="subtitle">${escaparHtmlEbd(idvMsgErro(data))}</p>`; return; }
  el.innerHTML = `<img class="idv-arte-img" src="${urlSegura(data.url)}" alt="Arte enviada para a identidade visual">`;
}
async function idvVerImagemAcao(arteId, ctx, botao) {
  const id = idvInteiro(arteId);
  if (!id) return;
  const marca = idvMarca(ctx === "Meu" ? "Meu" : "Ges");
  if (!idvViva(marca)) return;
  await idvProteger(botao, () => idvMostrarImagem(id, `idvImg_${id}`, marca), `imagem-${id}`);
}

// ============================================================================
// ABA DA DIRETORIA
// ============================================================================
async function idvAbrirAba() {
  idvVerificarDono();
  const marca = idvMarca("Ges");
  idvMostrarPilulas(!!(idvCat && idvCat.gestao));
  const cat = await idvGarantirCatalogos();
  if (!idvViva(marca)) return;
  idvMostrarPilulas(!!(cat && cat.gestao));
  if (!cat) { idvMostrar("idvSemAcesso", false); idvMostrar("idvConteudo", false); idvEscrever("idvGesMsg", "Não foi possível abrir a identidade visual agora. Verifique a internet e toque na aba de novo.", true); return; }
  idvEscrever("idvGesMsg", "", false);
  if (!cat.gestao) { idvMostrar("idvSemAcesso", true); idvMostrar("idvConteudo", false); return; }
  idvMostrar("idvSemAcesso", false); idvMostrar("idvConteudo", true);
  await idvMostrarSecaoAcao(idvSecaoAtual);
}
function idvAplicarSecao(secao) {
  idvSecaoAtual = secao;
  [["ciclo", "Ciclo"], ["temas", "Temas"]].forEach(([s, n]) => {
    idvMostrar(`idvSecao${n}`, s === secao);
    const b = idvEl(`btnIdvSecao${n}`);
    if (b) { b.classList.toggle("ativo", s === secao); b.setAttribute("aria-pressed", s === secao ? "true" : "false"); }
  });
}
async function idvMostrarSecaoAcao(secao) {
  const s = secao === "temas" ? "temas" : "ciclo";
  if (!idvCat || !idvCat.gestao) return;
  idvAplicarSecao(s);
  if (s === "ciclo") await idvCarregarPainel();
  if (s === "temas") await idvCarregarTemas();
}

// ---- ciclos ----
async function idvCarregarPainel() {
  const marca = idvMarca("Ges");
  const seq = ++idvSeqGes;
  idvEscrever("idvCicloMsg", "Carregando…", false);
  const data = await idvObter("painel");
  if (seq !== idvSeqGes || !idvViva(marca)) return;
  if (data.sucesso === false || !Array.isArray(data.ciclos)) { idvEscrever("idvCicloMsg", idvMsgErro(data), true); return; }
  idvEscrever("idvCicloMsg", "", false);
  idvPainel = data;
  if (!data.ciclos.some(c => idvInteiro(c.cicloId) === idvCicloSel)) idvCicloSel = data.ciclos.length ? idvInteiro(data.ciclos[0].cicloId) : null;
  idvPintarPainel();
  if (idvCicloSel) await idvCarregarCicloAcao(idvCicloSel);
  else { const el = idvEl("idvCicloDetalhe"); if (el) el.innerHTML = ""; }
}
function idvPintarPainel() {
  const el = idvEl("idvPainelTopo");
  if (!el || !idvPainel) return;
  const p = idvPainel;
  const abrir = p.podeAbrir
    ? `<p class="subtitle">O ciclo da identidade de ${Number(p.proximoAno)} ainda não foi aberto. Aberto, as sugestões dos membros vão de ${idvData(p.calendarioProximo && p.calendarioProximo.sugestao.inicio)} a ${idvData(p.calendarioProximo && p.calendarioProximo.sugestao.fim)}.</p>
      <div class="psc-acoes"><button type="button" class="btn-confirmar" data-on-click="idvAbrirCicloAcao" data-args-click="${argsAttr(Number(p.proximoAno), ARG.elemento)}">🎨 Abrir o ciclo da identidade de ${Number(p.proximoAno)}</button></div>`
    : p.motivoNaoAbre ? `<p class="subtitle">${escaparHtmlEbd(p.motivoNaoAbre)}</p>` : "";
  const pilulas = p.ciclos.length ? `<div class="cal-pilulas">${p.ciclos.map(c => {
    const id = idvInteiro(c.cicloId);
    return id ? `<button type="button" class="cal-pilula${id === idvCicloSel ? " ativo" : ""}" data-on-click="idvCarregarCicloAcao" data-args-click="${argsAttr(id)}">${Number(c.anoAlvo)} — ${escaparHtmlEbd(IDV_ROTULO_FASE[c.fase] || c.fase)}</button>` : "";
  }).join("")}</div>` : `<p class="subtitle">Nenhum ciclo aberto ainda.</p>`;
  el.innerHTML = abrir + pilulas;
}
async function idvAbrirCicloAcao(anoAlvo, botao) {
  const ano = idvInteiro(anoAlvo);
  if (!ano || !idvAbaVisivel()) return;
  if (!(await confirmarAcao(`Abrir o processo da identidade visual de ${ano}? Os membros verão as datas em Meu Painel e poderão mandar sugestões de 01 a 15 de novembro.`, "Abrir"))) return;
  const marca = idvMarca("Ges");
  await idvProteger(botao, async () => {
    const data = await idvPostar("abrir-ciclo", { anoAlvo: ano });
    if (!idvViva(marca)) return;
    if (data.sucesso !== false && idvInteiro(data.cicloId)) idvCicloSel = idvInteiro(data.cicloId);
    await idvCarregarPainel();
    if (idvViva(marca)) idvMostrarResultado(data, "idvCicloMsg");
  }, "abrir-ciclo");
}
async function idvCarregarCicloAcao(cicloId) {
  const id = idvInteiro(cicloId);
  if (!id || !idvAbaVisivel()) return;
  idvCicloSel = id;
  idvPintarPainel();
  const marca = idvMarca("Ges");
  const seq = ++idvSeqCiclo;
  const data = await idvObter(`ciclo?cicloId=${id}`);
  if (seq !== idvSeqCiclo || !idvViva(marca)) return;
  const el = idvEl("idvCicloDetalhe");
  if (!el) return;
  if (data.sucesso === false || !data.ciclo) { el.innerHTML = ""; idvEscrever("idvCicloMsg", data.httpStatus === 404 ? "Ciclo não encontrado." : idvMsgErro(data), true); return; }
  idvDetalhe = data;
  idvPintarCiclo();
}
function idvPodeTriar(c) { return c.fase === "TRIAGEM" || (c.fase === "VOTACAO" && !c.enqueteId); }
function idvPintarCiclo() {
  const el = idvEl("idvCicloDetalhe");
  const d = idvDetalhe;
  if (!el || !d) return;
  const c = d.ciclo;
  const id = idvInteiro(c.cicloId);
  const cancelar = ["AGUARDANDO", "SUGESTAO"].includes(c.fase) && !(d.sugestoes || []).length && !Number(d.retiradas)
    ? `<button type="button" class="btn-link btn-link-perigo" data-on-click="idvCancelarCicloAcao" data-args-click="${argsAttr(id, ARG.elemento)}">Cancelar este ciclo (aberto por engano)</button>` : "";
  el.innerHTML = `<section class="idv-cartao"><h4>Identidade visual de ${Number(c.anoAlvo)} — ${escaparHtmlEbd(IDV_ROTULO_FASE[c.fase] || c.fase)}</h4>
      ${idvLinhaDoTempo(c)}<p class="subtitle">Aberto${c.abertoPor ? ` por ${escaparHtmlEbd(c.abertoPor)}` : ""} em ${idvDataHora(c.abertoEm)}. ${cancelar}</p></section>
    ${idvPintarSugestoesGestao(d)}${idvPintarVotacaoGestao(d)}${idvPintarCoresGestao(d)}${idvPintarArtesGestao(d)}${idvPintarResultadoGestao(d)}`;
}
function idvPintarSugestoesGestao(d) {
  const c = d.ciclo;
  const lista = Array.isArray(d.sugestoes) ? d.sugestoes : [];
  const podeTriar = idvPodeTriar(c);
  const criterios = idvCat ? idvCat.criterios : [];
  const linhas = lista.map(s => {
    const id = idvInteiro(s.sugestaoId);
    if (!id) return "";
    const parecido = !s.parecido ? "" : s.parecido.igual
      ? `<br><span class="idv-alerta">⛔ Igual ao tema de ${Number(s.parecido.ano)}: "${escaparHtmlEbd(s.parecido.tema)}" — não pode ir à votação</span>`
      : `<br><span class="idv-alerta">⚠️ Parece com o tema de ${Number(s.parecido.ano)}: "${escaparHtmlEbd(s.parecido.tema)}"</span>`;
    const ajuste = s.textoFinal ? `<br><span class="subtitle">Redação ajustada: "${escaparHtmlEbd(s.textoFinal)}"</span>` : "";
    const criterio = s.criterio ? ` — ${escaparHtmlEbd(s.criterio.rotulo)}` : "";
    const obs = s.observacao ? `<br><span class="subtitle">Observação: ${escaparHtmlEbd(s.observacao)}</span>` : "";
    const quem = s.triadaPor ? `<br><span class="subtitle">Triada por ${escaparHtmlEbd(s.triadaPor)} em ${idvDataHora(s.triadaEm)}</span>` : "";
    const acoes = !podeTriar || s.anonimizada ? "" : `<div class="idv-triagem">
        <label for="idvAjuste_${id}">Redação para a votação (pode ajustar; a original fica guardada)</label>
        <input type="text" id="idvAjuste_${id}" maxlength="80" value="${escaparHtmlEbd(s.textoFinal || s.texto)}">
        <div class="psc-acoes"><button type="button" class="btn-confirmar" data-on-click="idvTriarAcao" data-args-click="${argsAttr(id, "FINALISTA", ARG.elemento)}">✔️ Finalista</button></div>
        <label for="idvCriterio_${id}">Ou descartar pelo critério</label>
        <select id="idvCriterio_${id}"><option value="">— critério —</option>${criterios.map(k => `<option value="${idvInteiro(k.codigo)}">${idvInteiro(k.codigo)}. ${escaparHtmlEbd(k.rotulo)}</option>`).join("")}</select>
        <input type="text" id="idvObs_${id}" maxlength="300" placeholder="Observação (opcional)">
        <div class="psc-acoes"><button type="button" class="btn-confirmar btn-secundario" data-on-click="idvTriarAcao" data-args-click="${argsAttr(id, "DESCARTADA", ARG.elemento)}">✖️ Descartar</button>
        ${s.situacao !== "ENVIADA" ? `<button type="button" class="btn-link" data-on-click="idvTriarAcao" data-args-click="${argsAttr(id, "ENVIADA", ARG.elemento)}">Voltar para a triagem</button>` : ""}</div></div>`;
    return `<li class="idv-sugestao"><strong>${escaparHtmlEbd(s.texto)}</strong> — ${escaparHtmlEbd(IDV_ROTULO_SUGESTAO_GESTAO[s.situacao] || s.situacao)}${criterio}${s.anonimizada ? " (sem o nome, a pedido do titular)" : ""}${ajuste}${parecido}${obs}${quem}${acoes}</li>`;
  }).join("");
  const finalistas = lista.filter(s => s.situacao === "FINALISTA").length;
  const aviso = podeTriar ? `<p class="subtitle">A triagem vê só o texto (nunca quem mandou). Aprove os finalistas — pelo menos 2 — ou descarte pelo critério do Art. 159, § 1º, I, a. A votação abre sozinha em ${idvData(c.calendario.votacao.inicio)}.</p>` : "";
  return `<section class="idv-cartao"><h4>Sugestões (${Number(lista.length)}; ${Number(finalistas)} finalista(s)${Number(d.retiradas) ? `; ${Number(d.retiradas)} retirada(s)` : ""}; ${Number(d.participantes)} pessoa(s))</h4>
    ${aviso}${lista.length ? `<ul class="idv-lista">${linhas}</ul>` : `<p class="subtitle">Nenhuma sugestão ainda.</p>`}</section>`;
}
function idvPintarVotacaoGestao(d) {
  const c = d.ciclo, v = d.votacao;
  const id = idvInteiro(c.cicloId);
  let corpo = "";
  const finalistas = (Array.isArray(d.sugestoes) ? d.sugestoes : []).filter(s => s.situacao === "FINALISTA" && idvInteiro(s.sugestaoId));
  const semDecisao = Number(d.semDecisao) || 0;
  if (!v && !c.apuracao && c.fase === "VOTACAO") corpo = `<p class="subtitle psc-aviso">A votação ainda não abriu: ela abre sozinha com pelo menos 2 finalistas e a triagem completa${semDecisao ? ` (há ${semDecisao} sugestão(ões) sem decisão)` : ""}. Conclua a triagem ou abra agora.</p>
    <div class="psc-acoes"><button type="button" class="btn-confirmar" data-on-click="idvAbrirVotacaoAcao" data-args-click="${argsAttr(id, ARG.elemento)}">🗳️ Abrir a votação agora</button></div>`;
  // ciclo sem saída: a partir do dia 22 com menos de 2 finalistas, ou depois do dia 30 sem votação — a Diretoria define o tema entre os finalistas, com o motivo
  if (!v && !c.apuracao && finalistas.length && ((c.fase === "VOTACAO" && finalistas.length < 2) || ["ARTE", "ENCERRADO"].includes(c.fase))) {
    corpo += `<div class="idv-triagem"><p class="subtitle">Sem votação possível (${finalistas.length < 2 ? "menos de 2 finalistas" : "a votação não aconteceu"}): a Diretoria define o tema entre os finalistas, dizendo por quê.</p>
      <label for="idvTemaUnicoOpcao">Tema</label><select id="idvTemaUnicoOpcao"><option value="">— escolha —</option>${finalistas.map(s => `<option value="${idvInteiro(s.sugestaoId)}">${escaparHtmlEbd(s.textoFinal || s.texto)}</option>`).join("")}</select>
      <label for="idvTemaUnicoMotivo">Por quê (a reunião, a ata)</label><textarea id="idvTemaUnicoMotivo" maxlength="300" rows="2"></textarea>
      <div class="psc-acoes"><button type="button" class="btn-confirmar" data-on-click="idvTemaSemVotacaoAcao" data-args-click="${argsAttr(ARG.elemento)}">✔️ Definir o tema sem votação</button></div></div>`;
  }
  if (v) corpo = `<p class="subtitle">${v.aberta ? `Aberta em Meu Painel até ${idvData(c.calendario.votacao.fim)}.` : "Encerrada."} ${Number(v.participantes)} pessoa(s) votaram${c.votacaoAutomatica ? " (abriu sozinha no dia 22)" : ""}.</p>${idvContagem(v)}`;
  if (c.apuracao) corpo += `<p><strong>${escaparHtmlEbd(IDV_ROTULO_APURACAO[c.apuracao] || c.apuracao)}</strong></p>`;
  if (c.tema) corpo += `<p class="idv-tema">Tema de ${Number(c.anoAlvo)}: <strong>${escaparHtmlEbd(c.tema.texto)}</strong>${c.tema.desempate ? ` — definido pela Diretoria (${escaparHtmlEbd(c.tema.desempate.motivo)})` : ""}</p>`;
  if (c.apuracao && !c.tema && v) {
    const maior = Math.max(0, ...v.opcoes.map(o => Number(o.votos) || 0));
    const elegiveis = v.opcoes.filter(o => idvInteiro(o.sugestaoId) && (Number(o.votos) || 0) === maior);
    corpo += `<div class="idv-triagem"><label for="idvDesempateOpcao">Tema escolhido pela Diretoria</label>
      <select id="idvDesempateOpcao"><option value="">— escolha —</option>${elegiveis.map(o => `<option value="${idvInteiro(o.sugestaoId)}">${escaparHtmlEbd(o.texto)}</option>`).join("")}</select>
      <label for="idvDesempateMotivo">Por quê (a reunião, a ata)</label><textarea id="idvDesempateMotivo" maxlength="300" rows="2"></textarea>
      <div class="psc-acoes"><button type="button" class="btn-confirmar" data-on-click="idvDesempatarAcao" data-args-click="${argsAttr(ARG.elemento)}">✔️ Definir o tema</button></div></div>`;
  }
  if (!corpo) return "";
  return `<section class="idv-cartao"><h4>Votação</h4>${corpo}</section>`;
}
function idvPintarCoresGestao(d) {
  const c = d.ciclo;
  const cores = Array.isArray(d.cores) ? d.cores : [];
  const podeMexer = ["TRIAGEM", "VOTACAO", "ARTE"].includes(c.fase);
  if (!podeMexer && !cores.length) return "";
  const lista = cores.map(k => {
    const id = idvInteiro(k.corId);
    return `<li>${Number(k.ordem)}. ${idvAmostra(k)}${podeMexer && id ? ` <button type="button" class="btn-link btn-link-perigo" data-on-click="idvExcluirCorAcao" data-args-click="${argsAttr(id, ARG.elemento)}">Apagar</button>` : ""}</li>`;
  }).join("");
  const form = !podeMexer ? "" : `<div class="idv-form-cor"><label for="idvCorOrdem">Posição</label><select id="idvCorOrdem"><option value="1">1</option><option value="2">2</option><option value="3">3</option></select>
      <label for="idvCorNome">Nome da cor do tecido</label><input type="text" id="idvCorNome" maxlength="40" placeholder="Ex.: Azul royal">
      <label for="idvCorHex">Cor</label><input type="color" id="idvCorHex" value="#1A4D8F">
      <div class="psc-acoes"><button type="button" class="btn-confirmar" data-on-click="idvSalvarCorAcao" data-args-click="${argsAttr(ARG.elemento)}">💾 Registrar a cor</button></div></div>
    <p class="subtitle">Até 3 cores de tecido viáveis (Art. 159, § 1º, IV, a). Depois que chega a primeira arte, a cor usada nela não muda mais.</p>`;
  return `<section class="idv-cartao"><h4>Cores do ano</h4>${cores.length ? `<ul class="idv-lista">${lista}</ul>` : `<p class="subtitle">Nenhuma cor registrada.</p>`}${form}</section>`;
}
function idvPintarArtesGestao(d) {
  const artes = Array.isArray(d.artes) ? d.artes : [];
  if (!artes.length && d.ciclo.fase !== "ARTE") return "";
  const lista = artes.map(a => {
    const id = idvInteiro(a.arteId);
    if (!id) return "";
    const ver = a.temImagem ? ` <button type="button" class="btn-link" data-on-click="idvVerImagemAcao" data-args-click="${argsAttr(id, "Ges", ARG.elemento)}">Ver a imagem</button>` : "";
    const recusar = a.situacao === "ENVIADA" && !d.resultado ? `<div class="idv-triagem"><input type="text" id="idvMotivo_${id}" maxlength="300" placeholder="Motivo (ex.: ilegível nas cores do tecido)">
      <button type="button" class="btn-link btn-link-perigo" data-on-click="idvRecusarArteAcao" data-args-click="${argsAttr(id, ARG.elemento)}">Tirar do concurso</button></div>` : "";
    const motivo = a.motivoRecusa ? `<br><span class="subtitle">Motivo: ${escaparHtmlEbd(a.motivoRecusa)}</span>` : "";
    return `<li><strong>${escaparHtmlEbd(a.titulo || "Sem título")}</strong> — ${escaparHtmlEbd(a.autor)}${a.congregacao ? ` (${escaparHtmlEbd(a.congregacao)})` : ""} — ${escaparHtmlEbd(IDV_ROTULO_ARTE[a.situacao] || a.situacao)}
      ${a.descricao ? `<br><span class="subtitle">${escaparHtmlEbd(a.descricao)}</span>` : ""}${motivo}${ver}${recusar}<div id="idvImg_${id}"></div></li>`;
  }).join("");
  return `<section class="idv-cartao"><h4>Artes do concurso (${Number(artes.length)})</h4>${artes.length ? `<ul class="idv-lista">${lista}</ul>` : `<p class="subtitle">Nenhuma arte ainda.</p>`}</section>`;
}
function idvPintarResultadoGestao(d) {
  const c = d.ciclo, r = d.resultado;
  if (r) return `<section class="idv-cartao idv-resultado"><h4>Escolha final registrada</h4><p class="idv-tema"><strong>${escaparHtmlEbd(r.tema)}</strong> — ${idvAmostra(r.cor)}</p>
    <p class="subtitle">${escaparHtmlEbd(r.ocasiaoRotulo || r.ocasiao)} de ${idvData(r.dataCulto)}: ${Number(r.votosVencedor)} voto(s)${r.presentes != null ? ` de ${Number(r.presentes)} presentes` : ""}.
      ${r.ata ? `Ata: ${escaparHtmlEbd(r.ata)}.` : ""} Registrado por ${escaparHtmlEbd(r.registradoPor || "—")} em ${idvDataHora(r.registradoEm)}.</p></section>`;
  if (!(c.fase === "ARTE" || c.resultadoPendente) || !c.tema) return "";
  const artes = (Array.isArray(d.artes) ? d.artes : []).filter(a => a.situacao === "ENVIADA" && idvInteiro(a.arteId));
  const cores = (Array.isArray(d.cores) ? d.cores : []).filter(k => idvInteiro(k.corId));
  const ocasioes = idvCat ? idvCat.ocasioes : [];
  return `<section class="idv-cartao"><h4>Registrar a escolha final do culto</h4>
    <p class="subtitle">A arte e a cor escolhidas por maioria simples dos presentes no Culto Administrativo de Dezembro ou na Vigília de Ano Novo (Art. 159, § 1º, V e VI). Depois de
      registrado, não se edita, e o tema entra sozinho na lista de temas já usados.</p>
    <label for="idvResArte">Arte do concurso</label><select id="idvResArte"><option value="">— escolha —</option>${artes.map(a => `<option value="${idvInteiro(a.arteId)}">${escaparHtmlEbd(a.titulo || "Sem título")} — ${escaparHtmlEbd(a.autor)}</option>`).join("")}</select>
    <label for="idvResImagem">Ou, se a arte escolhida no culto não veio pelo sistema, a imagem dela (PNG ou JPEG, até 5 MB)</label><input type="file" id="idvResImagem" accept="image/png,image/jpeg">
    <label for="idvResCor">Cor</label><select id="idvResCor"><option value="">— escolha —</option>${cores.map(k => `<option value="${idvInteiro(k.corId)}">${escaparHtmlEbd(k.nome)}</option>`).join("")}</select>
    <label for="idvResData">Data do culto</label><input type="date" id="idvResData">
    <label for="idvResOcasiao">Ocasião</label><select id="idvResOcasiao">${ocasioes.map(o => `<option value="${escaparHtmlEbd(o.codigo)}">${escaparHtmlEbd(o.rotulo)}</option>`).join("")}</select>
    <label for="idvResVotos">Votos do modelo escolhido</label><input type="number" id="idvResVotos" min="1" inputmode="numeric">
    <label for="idvResPresentes">Presentes (opcional)</label><input type="number" id="idvResPresentes" min="1" inputmode="numeric">
    <label for="idvResAta">Ata ou observação (opcional)</label><textarea id="idvResAta" maxlength="1000" rows="2"></textarea>
    <div class="psc-acoes"><button type="button" class="btn-confirmar" data-on-click="idvRegistrarResultadoAcao" data-args-click="${argsAttr(ARG.elemento)}">🏁 Registrar o resultado</button></div></section>`;
}

// ---- atos da Diretoria ----
async function idvAtoNoCiclo(botao, caminho, corpo, chave) {
  const marca = idvMarca("Ges");
  await idvProteger(botao, async () => {
    const data = await idvPostar(caminho, corpo);
    if (!idvViva(marca)) return;
    idvMostrarResultado(data, "idvCicloMsg");
    if (idvCicloSel) await idvCarregarCicloAcao(idvCicloSel);
    if (idvViva(marca)) idvEscrever("idvCicloMsg", idvMsgErro(data), data.sucesso === false);
  }, chave);
}
async function idvCancelarCicloAcao(cicloId, botao) {
  const id = idvInteiro(cicloId);
  if (!id || !idvAbaVisivel()) return;
  if (!(await confirmarAcao("Cancelar este ciclo? Ele foi aberto por engano e ainda não tem sugestões.", "Cancelar o ciclo"))) return;
  const marca = idvMarca("Ges");
  await idvProteger(botao, async () => {
    const data = await idvPostar("cancelar-ciclo", { cicloId: id });
    if (!idvViva(marca)) return;
    if (data.sucesso !== false) idvCicloSel = null;
    await idvCarregarPainel();
    if (idvViva(marca)) idvMostrarResultado(data, "idvCicloMsg");
  }, `cancelar-${id}`);
}
async function idvTriarAcao(sugestaoId, decisao, botao) {
  const id = idvInteiro(sugestaoId);
  if (!id || !["FINALISTA", "DESCARTADA", "ENVIADA"].includes(decisao) || !idvAbaVisivel()) return;
  const corpo = { sugestaoId: id, decisao };
  if (decisao === "FINALISTA") { const t = idvValor(`idvAjuste_${id}`); if (t) corpo.textoAjustado = t; }
  if (decisao === "DESCARTADA") {
    const criterio = idvInteiro(idvValor(`idvCriterio_${id}`));
    if (!criterio) { idvEscrever("idvCicloMsg", "Escolha o critério do descarte.", true); return; }
    corpo.criterio = criterio;
    const obs = idvValor(`idvObs_${id}`); if (obs) corpo.observacao = obs;
  }
  await idvAtoNoCiclo(botao, "triar", corpo, `triar-${id}`);
}
async function idvAbrirVotacaoAcao(cicloId, botao) {
  const id = idvInteiro(cicloId);
  if (!id || !idvAbaVisivel()) return;
  if (!(await confirmarAcao("Abrir agora a votação com os finalistas aprovados? Depois disso a lista não muda mais.", "Abrir a votação"))) return;
  const marca = idvMarca("Ges");
  await idvProteger(botao, async () => {
    let data = await idvPostar("abrir-votacao", { cicloId: id });
    if (!idvViva(marca)) return;
    const pendentes = idvInteiro(data.pendentes);
    if (data.sucesso === false && pendentes) {
      if (!(await confirmarAcao(`Há ${pendentes} sugestão(ões) ainda sem decisão da triagem. Abrir a votação assim mesmo? Elas ficam fora.`, "Abrir assim mesmo"))) {
        if (idvViva(marca)) idvEscrever("idvCicloMsg", "A votação não foi aberta: termine a triagem.", false);
        return;
      }
      if (!idvViva(marca)) return;
      data = await idvPostar("abrir-votacao", { cicloId: id, aceitarPendentes: true });
      if (!idvViva(marca)) return;
    }
    idvMostrarResultado(data, "idvCicloMsg");
    if (idvCicloSel) await idvCarregarCicloAcao(idvCicloSel);
    if (idvViva(marca)) idvEscrever("idvCicloMsg", idvMsgErro(data), data.sucesso === false);
  }, `votacao-${id}`);
}
async function idvTemaSemVotacaoAcao(botao) {
  if (!idvAbaVisivel()) return;
  const sugestaoId = idvInteiro(idvValor("idvTemaUnicoOpcao"));
  const motivo = idvValor("idvTemaUnicoMotivo");
  if (!sugestaoId) { idvEscrever("idvCicloMsg", "Escolha o tema.", true); return; }
  if (motivo.length < 5) { idvEscrever("idvCicloMsg", "Escreva por quê (a reunião ou a ata da decisão).", true); return; }
  if (!(await confirmarAcao("Definir o tema do ano sem votação? A decisão fica registrada com o seu nome e o motivo.", "Definir o tema"))) return;
  await idvAtoNoCiclo(botao, "tema-sem-votacao", { sugestaoId, motivo }, "tema-sem-votacao");
}
async function idvDesempatarAcao(botao) {
  if (!idvAbaVisivel()) return;
  const sugestaoId = idvInteiro(idvValor("idvDesempateOpcao"));
  const motivo = idvValor("idvDesempateMotivo");
  if (!sugestaoId) { idvEscrever("idvCicloMsg", "Escolha o tema.", true); return; }
  if (motivo.length < 5) { idvEscrever("idvCicloMsg", "Escreva por quê (a reunião ou a ata da decisão).", true); return; }
  await idvAtoNoCiclo(botao, "desempate", { sugestaoId, motivo }, "desempate");
}
async function idvSalvarCorAcao(botao) {
  if (!idvAbaVisivel() || !idvCicloSel) return;
  const hex = idvCor(idvValor("idvCorHex"));
  if (!hex) { idvEscrever("idvCicloMsg", "Escolha a cor.", true); return; }
  await idvAtoNoCiclo(botao, "cor", { cicloId: idvCicloSel, ordem: idvInteiro(idvValor("idvCorOrdem")), nome: idvValor("idvCorNome"), hex }, "cor");
}
async function idvExcluirCorAcao(corId, botao) {
  const id = idvInteiro(corId);
  if (!id || !idvAbaVisivel()) return;
  if (!(await confirmarAcao("Apagar esta cor?", "Apagar"))) return;
  await idvAtoNoCiclo(botao, "excluir-cor", { corId: id }, `cor-${id}`);
}
async function idvRecusarArteAcao(arteId, botao) {
  const id = idvInteiro(arteId);
  if (!id || !idvAbaVisivel()) return;
  const motivo = idvValor(`idvMotivo_${id}`);
  if (motivo.length < 3) { idvEscrever("idvCicloMsg", "Escreva o motivo (a pessoa vai ver).", true); return; }
  if (!(await confirmarAcao("Tirar esta arte do concurso? A decisão não se desfaz.", "Tirar do concurso"))) return;
  await idvAtoNoCiclo(botao, "recusar-arte", { arteId: id, motivo }, `arte-${id}`);
}
async function idvRegistrarResultadoAcao(botao) {
  if (!idvAbaVisivel() || !idvCicloSel) return;
  const arteId = idvInteiro(idvValor("idvResArte")), corId = idvInteiro(idvValor("idvResCor"));
  const campoImagem = idvEl("idvResImagem");
  const arquivo = campoImagem && campoImagem.files && campoImagem.files[0];
  if (arteId && arquivo) { idvEscrever("idvCicloMsg", "Escolha uma arte do concurso OU envie a imagem — não as duas.", true); return; }
  if ((!arteId && !arquivo) || !corId) { idvEscrever("idvCicloMsg", "Escolha a arte (ou envie a imagem dela) e a cor.", true); return; }
  if (arquivo && (!IDV_TIPOS_IMAGEM.includes(arquivo.type) || !(arquivo.size > 0) || arquivo.size > 5 * 1024 * 1024)) { idvEscrever("idvCicloMsg", "A imagem tem de ser PNG ou JPEG, até 5 MB.", true); return; }
  if (!idvValor("idvResData")) { idvEscrever("idvCicloMsg", "Informe a data do culto.", true); return; }
  const votos = idvInteiro(idvValor("idvResVotos"));
  if (!votos) { idvEscrever("idvCicloMsg", "Informe quantos votos o modelo escolhido recebeu.", true); return; }
  const presentes = idvValor("idvResPresentes");
  if (!(await confirmarAcao("Registrar a Identidade Visual oficial? Depois de registrado, o resultado não se edita.", "Registrar"))) return;
  const marca = idvMarca("Ges");
  let imagem = {};
  if (arquivo) {
    try { imagem = { imagemBase64: await idvBase64(arquivo), tipo: arquivo.type }; } catch (e) { idvEscrever("idvCicloMsg", "Não foi possível ler a imagem. Escolha o arquivo de novo.", true); return; }
    // enquanto a imagem era lida a pessoa pode ter saído da aba ou da sessão: o resultado não sai em nome de ninguém
    if (!idvViva(marca)) return;
  }
  await idvAtoNoCiclo(botao, "resultado", { cicloId: idvCicloSel, ...(arteId ? { arteId } : imagem), corId, dataCulto: idvValor("idvResData"), ocasiao: idvValor("idvResOcasiao"), votosVencedor: votos,
    presentes: presentes ? idvInteiro(presentes) || presentes : undefined, ata: idvValor("idvResAta") || undefined }, "resultado");
}

// ---- Temas já usados ----
async function idvCarregarTemas() {
  const marca = idvMarca("Ges");
  const seq = ++idvSeqGes;
  idvEscrever("idvTemasMsg", "Carregando…", false);
  const data = await idvObter("temas");
  if (seq !== idvSeqGes || !idvViva(marca) || idvSecaoAtual !== "temas") return;
  if (data.sucesso === false || !Array.isArray(data.temas)) { idvEscrever("idvTemasMsg", idvMsgErro(data), true); return; }
  idvEscrever("idvTemasMsg", "", false);
  const form = idvEl("idvTemasForm");
  if (form) form.innerHTML = `<label for="idvTemaAno">Ano</label><input type="number" id="idvTemaAno" min="2006" inputmode="numeric">
    <label for="idvTemaTexto">Tema</label><input type="text" id="idvTemaTexto" maxlength="150" autocomplete="off">
    <div class="psc-acoes"><button type="button" class="btn-confirmar" data-on-click="idvSalvarTemaAcao" data-args-click="${argsAttr(0, ARG.elemento)}">💾 Cadastrar</button></div>`;
  const lista = idvEl("idvTemasLista");
  if (!lista) return;
  if (!data.temas.length) { lista.innerHTML = `<p class="subtitle">Nenhum tema cadastrado. Cadastre os temas usados desde 2006: a sugestão igual a um deles é recusada na hora.</p>`; return; }
  lista.innerHTML = `<ul class="idv-lista">${data.temas.map(t => {
    const id = idvInteiro(t.temaUsadoId);
    if (!id) return "";
    if (t.origem !== "MANUAL") return `<li><strong>${Number(t.ano)}</strong> — ${escaparHtmlEbd(t.tema)} <span class="subtitle">(escolhido pelo processo no sistema; não se edita)</span></li>`;
    return `<li class="idv-tema-manual"><input type="number" id="idvTemaAno_${id}" value="${Number(t.ano)}" min="2006" inputmode="numeric" aria-label="Ano">
      <input type="text" id="idvTemaTexto_${id}" value="${escaparHtmlEbd(t.tema)}" maxlength="150" aria-label="Tema">
      <button type="button" class="btn-link" data-on-click="idvSalvarTemaAcao" data-args-click="${argsAttr(id, ARG.elemento)}">Salvar</button>
      <button type="button" class="btn-link btn-link-perigo" data-on-click="idvExcluirTemaAcao" data-args-click="${argsAttr(id, ARG.elemento)}">Apagar</button></li>`;
  }).join("")}</ul>`;
}
async function idvSalvarTemaAcao(temaUsadoId, botao) {
  if (!idvAbaVisivel()) return;
  const id = idvInteiro(temaUsadoId);
  const ano = idvInteiro(idvValor(id ? `idvTemaAno_${id}` : "idvTemaAno"));
  const tema = idvValor(id ? `idvTemaTexto_${id}` : "idvTemaTexto");
  if (!ano || !tema) { idvEscrever("idvTemasMsg", "Informe o ano e o tema.", true); return; }
  const marca = idvMarca("Ges");
  await idvProteger(botao, async () => {
    const data = await idvPostar("tema", id ? { temaUsadoId: id, ano, tema } : { ano, tema });
    if (!idvViva(marca)) return;
    idvMostrarResultado(data, "idvTemasMsg");
    if (data.sucesso !== false) { await idvCarregarTemas(); if (idvViva(marca)) idvEscrever("idvTemasMsg", idvMsgErro(data), false); }
  }, `tema-${id}`);
}
async function idvExcluirTemaAcao(temaUsadoId, botao) {
  const id = idvInteiro(temaUsadoId);
  if (!id || !idvAbaVisivel()) return;
  if (!(await confirmarAcao("Apagar este tema da lista de temas já usados?", "Apagar"))) return;
  const marca = idvMarca("Ges");
  await idvProteger(botao, async () => {
    const data = await idvPostar("excluir-tema", { temaUsadoId: id });
    if (!idvViva(marca)) return;
    idvMostrarResultado(data, "idvTemasMsg");
    if (data.sucesso !== false) { await idvCarregarTemas(); if (idvViva(marca)) idvEscrever("idvTemasMsg", idvMsgErro(data), false); }
  }, `tema-${id}`);
}

registrarAcoes({
  idvAbrirCicloAcao, idvAbrirVotacaoAcao, idvCancelarCicloAcao, idvCarregarCicloAcao, idvCarregarMeuPainelAcao, idvDesempatarAcao, idvEnviarArteAcao,
  idvExcluirCorAcao, idvExcluirTemaAcao, idvMostrarSecaoAcao, idvRecusarArteAcao, idvRegistrarResultadoAcao, idvRetirarArteAcao, idvRetirarSugestaoAcao, idvSalvarCorAcao,
  idvSalvarTemaAcao, idvSugerirAcao, idvTemaSemVotacaoAcao, idvTriarAcao, idvVerImagemAcao, idvVotarAcao
});
