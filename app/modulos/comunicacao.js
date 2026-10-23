// app/modulos/comunicacao.js — v7.12: Comunicação — consentimento por canal e categoria, modelos aprovados, envio por grupo e registro de entrega (LGPD arts. 7º, I, 8º e 11;
// a convocação oficial é obrigação do Estatuto). Decisões de 22/10/2026: sem WhatsApp e sem SMS; nenhum grupo pelo dízimo.
// Script clássico, carregado pelo index.html DEPOIS do script.js e do eventos.js: compartilha o escopo global com eles. Todos os nomes de nível superior começam com "com"/"COM_".
//
// Duas telas sobre uma rota do servidor (GestaoComunicacao: /api/comunicacao/*):
//   1) Meu Painel → Comunicações (qualquer login, inclusive PIN): o que a pessoa quer receber, por categoria e por canal, lendo o texto exato de cada autorização; e os comunicados
//      que ela recebeu, com o "Recebi a convocação" da convocação oficial (e o "Li o aviso" do aviso de crise da v7.15);
//   2) aba "Comunicação" (permissão comunicacao, sessão de liderança): ENVIAR (modelo aprovado + grupo montado pelos critérios + quantas pessoas, antes de mandar), ENVIOS (relatório de
//      entrega e leitura; na convocação, quem não foi alcançado), MODELOS (só o nível geral escreve e aprova) e FICHA EM PAPEL (só o nível geral: o "sim" ou o "não" que a pessoa deu no papel).
// Toda regra mora no servidor (shared/comunicacao.js e shared/comunicacaoDb.js): aqui só se monta o que ele devolve e se manda o que a pessoa fez. 422 = recusa de regra, mostrada tal
// qual; 404 = a MESMA resposta para "não existe" e "não é seu"; 428 = confirmação reforçada da vD.4 (o mesmo confirmarFatorAgora do fetchProtegido, e a chamada repetida uma vez).
// Tudo o que vem do servidor e entra em innerHTML passa por escaparHtmlEbd; id de elemento e argumento de ação levam só número inteiro ou código validado aqui.
const COM_ROTA = "comunicacao";
const COM_SECOES = ["enviar", "envios", "modelos", "ficha"];
const COM_TEMPO_LIMITE_MS = 20000;
const COM_MSG_FATOR = "Este ato precisa de uma confirmação recente de quem você é (chave de acesso ou código por e-mail). Tente de novo e confirme quando a tela pedir.";
const COM_MSG_TEMPO = "Não foi possível falar com o servidor a tempo (20 segundos sem resposta). Verifique a internet e tente de novo. Se você estava enviando, confira em Envios antes de repetir.";
const COM_MSG_REDE = "Não foi possível falar com o servidor agora. Verifique a internet e tente de novo.";
const COM_CODIGO = /^[A-Z][A-Z_]{1,29}$/;      // código vindo do servidor que pode entrar em id de elemento

let comDono = null;
let comCat = null;                 // GET catalogos
let comGeracao = 0, comGerGes = 0, comGerMeu = 0;
let comSecaoAtual = "enviar";
let comPrefs = null;               // GET preferencias (o que a tela mostrou: a mudança é calculada contra isto)
let comModelos = [], comOpcoes = null, comGrupos = [], comEnvios = [];
let comPrevia = null;              // { chave, total } — "Enviar" só vale para o mesmo modelo e o mesmo grupo da última contagem
let comModeloChave = null;         // o modelo em edição (nova versão / rascunho): a chave dele
let comSeqMeu = 0, comSeqGes = 0, comSeqRel = 0;
const comEmCurso = new Set();

function comPodeAba() { return authPermissoes.includes("comunicacao"); }
function comEhGestao() { return !!(comCat && comCat.papeis.gestao); }
function comEhGeral() { return !!(comCat && comCat.papeis.geral); }
function comEl(id) { return document.getElementById(id); }
function comValor(id) { const c = comEl(id); return c ? String(c.value == null ? "" : c.value).trim() : ""; }
function comMarcado(id) { const c = comEl(id); return !!(c && c.checked); }
function comInteiro(v) { const n = Number(v); return Number.isInteger(n) && n >= 1 ? n : 0; }
function comMsgErro(data) { return (data && data.mensagem) || "Não foi possível concluir a operação agora."; }
function comTem(mapa, chave) { return !!mapa && Object.prototype.hasOwnProperty.call(mapa, chave); }
function comEscrever(id, texto, destaque) { const el = comEl(id); if (el) { el.textContent = texto; el.className = destaque ? "subtitle psc-aviso" : "subtitle"; } }
function comMostrar(id, visivel) { const el = comEl(id); if (el) el.style.display = visivel ? "block" : "none"; }
function comData(v) { return escaparHtmlEbd(typeof calDataHora === "function" ? calDataHora(v) : String(v || "")); }
function comMarca(ctx) { return { ctx, g: comGeracao, t: ctx === "Meu" ? comGerMeu : comGerGes }; }
function comViva(m) { return !!m && m.g === comGeracao && (m.ctx === "Meu" ? m.t === comGerMeu && comMeuVisivel() : m.t === comGerGes && comAbaVisivel()); }
async function comProteger(botao, tarefa, chave) {
  if (chave) {
    if (comEmCurso.has(chave)) { mostrarToast("Aguarde: o pedido anterior ainda está sendo processado.", "erro"); return undefined; }
    comEmCurso.add(chave);
  }
  if (botao && typeof botao === "object") botao.disabled = true;
  try { return await tarefa(); } finally {
    if (botao && typeof botao === "object") botao.disabled = false;
    if (chave) comEmCurso.delete(chave);
  }
}

// ---- falar com o servidor ----
async function comTentar(url, opcoes) {
  const controle = typeof AbortController === "function" ? new AbortController() : null;
  const limite = controle ? setTimeout(() => controle.abort(), COM_TEMPO_LIMITE_MS) : null;
  try {
    const res = await fetchProtegido(url, Object.assign({}, opcoes || {}, { semFator: true }, controle ? { signal: controle.signal } : {}));
    let corpo = null;
    try { corpo = await res.json(); } catch { corpo = null; }
    return { res, corpo };
  } finally { if (limite != null) clearTimeout(limite); }
}
async function comRequisitar(caminho, opcoes) {
  const url = `${API_BASE}/${COM_ROTA}/${caminho}`;
  try {
    let r = await comTentar(url, opcoes);
    if (r.res.status === 428) { const ok = await confirmarFatorAgora(); if (ok) r = await comTentar(url, opcoes); }
    const { res, corpo } = r;
    if (!corpo || typeof corpo !== "object" || Array.isArray(corpo)) return { sucesso: false, mensagem: `Resposta inesperada do servidor (${res.status}).`, httpStatus: res.status };
    if (res.status >= 400) corpo.sucesso = false;
    if (res.status === 428 || corpo.precisaFator) corpo.mensagem = COM_MSG_FATOR;
    corpo.httpStatus = res.status;
    if (res.status === 403 || res.status >= 500) corpo.jaAvisado = true;
    return corpo;
  } catch (e) {
    if (e && e.message === "Sessão expirada") return { sucesso: false, jaAvisado: true, mensagem: "Sua sessão expirou. Entre novamente." };
    if (e && e.name === "AbortError") return { sucesso: false, jaAvisado: true, falhaDeRede: true, tempoEsgotado: true, mensagem: COM_MSG_TEMPO };
    return { sucesso: false, jaAvisado: true, falhaDeRede: true, mensagem: COM_MSG_REDE };
  }
}
function comObter(caminho) { return comRequisitar(caminho); }
function comPostar(caminho, corpo) { return comRequisitar(caminho, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo) }); }
function comMostrarResultado(data, idMensagem) {
  const texto = comMsgErro(data);
  const falhou = !!(data && data.sucesso === false);
  if (!(data && data.jaAvisado)) mostrarToast(texto, falhou ? "erro" : "sucesso");
  comEscrever(idMensagem, texto, falhou);
}
async function comGarantirCatalogos(forcar) {
  if (comCat && !forcar) return comCat;
  const geracao = comGeracao;
  const data = await comObter("catalogos");
  if (geracao !== comGeracao) return comCat;
  if (data.sucesso === false) return comCat;
  const lista = (v) => (Array.isArray(v) ? v.filter(x => x && typeof x === "object" && typeof x.codigo === "string" && COM_CODIGO.test(x.codigo)) : []);
  const papeis = data.papeis && typeof data.papeis === "object" ? data.papeis : {};
  comCat = { categorias: lista(data.categorias), canais: lista(data.canais), situacoes: data.situacoes && typeof data.situacoes === "object" ? data.situacoes : {},
    papeis: { gestao: !!papeis.gestao, geral: !!papeis.geral } };
  return comCat;
}
function comRotuloCategoria(codigo) { const c = comCat && comCat.categorias.find(x => x.codigo === codigo); return c ? c.rotulo : String(codigo || ""); }
function comRotuloSituacao(codigo) { return comCat && comTem(comCat.situacoes, codigo) ? String(comCat.situacoes[codigo]) : String(codigo || ""); }

// ---- troca de login e saída da tela: nada da pessoa anterior fica na página ----
const COM_IDS_LISTAS = ["comMeuPrefs", "comMeuComunicados", "comEnvForm", "comEnvPrevia", "comEnvResultado", "comEnviosLista", "comRelatorio", "comModelosLista", "comModeloForm", "comFichaForm"];
const COM_IDS_MSGS = ["comMeuMsg", "comGesMsg", "comEnvMsg", "comEnviosMsg", "comModelosMsg", "comFichaMsg"];
function comFecharGestao() {
  comGerGes++; comSeqGes++; comSeqRel++;
  comModelos = []; comOpcoes = null; comGrupos = []; comEnvios = []; comPrevia = null; comModeloChave = null;
  ["comEnvForm", "comEnvPrevia", "comEnvResultado", "comEnviosLista", "comRelatorio", "comModelosLista", "comModeloForm", "comFichaForm"].forEach(id => { const el = comEl(id); if (el) el.innerHTML = ""; });
  ["comGesMsg", "comEnvMsg", "comEnviosMsg", "comModelosMsg", "comFichaMsg"].forEach(id => comEscrever(id, "", false));
}
function comFecharMeu() {
  comGerMeu++; comSeqMeu++;
  comPrefs = null;
  ["comMeuPrefs", "comMeuComunicados"].forEach(id => { const el = comEl(id); if (el) el.innerHTML = ""; });
  comEscrever("comMeuMsg", "", false);
}
function comLimparTela() {
  comGeracao++;
  comFecharGestao(); comFecharMeu();
  comCat = null; comSecaoAtual = "enviar"; comEmCurso.clear();
  COM_IDS_LISTAS.forEach(id => { const el = comEl(id); if (el) el.innerHTML = ""; });
  COM_IDS_MSGS.forEach(id => comEscrever(id, "", false));
  comMostrar("comSemAcesso", false);
  comMostrarPilulasDoGeral(false);   // as pílulas do nível geral não ficam para a próxima pessoa (nem enquanto a aba dela carrega)
  comAplicarSecao("enviar");
}
function comMostrarPilulasDoGeral(visivel) { comMostrar("btnComSecaoModelos", visivel); comMostrar("btnComSecaoFicha", visivel); }
function comChaveDoDono() { return `${authMatricula}|${sessaoDeLiderancaNaTela() ? "senha" : "pin"}`; }
function comVerificarDono() { if (comDono !== comChaveDoDono()) { comLimparTela(); comDono = comChaveDoDono(); } }
function comAbaMudou(aba) {
  if (aba !== "comunicacao") comFecharGestao();
  if (aba !== "meupainel") comFecharMeu();
}
function comSubAbaMudou(sub) { if (sub !== "comunicacoes") comFecharMeu(); }
function comAbaVisivel() { const a = comEl("abaComunicacao"); return !!(authToken && comDono === comChaveDoDono() && a && a.style.display === "block"); }
function comMeuVisivel() { const s = comEl("subMeupainelComunicacoes"); return !!(authToken && comDono === comChaveDoDono() && s && s.style.display === "block"); }

// ============================================================================
// MEU PAINEL → COMUNICAÇÕES
// ============================================================================
async function comCarregarMeuPainelAcao() {
  comVerificarDono();
  const marca = comMarca("Meu");
  if (!comViva(marca)) return;
  const seq = ++comSeqMeu;
  comEscrever("comMeuMsg", "Carregando…", false);
  const [prefs, recebidos] = await Promise.all([comObter("preferencias"), comObter("meus-comunicados"), comGarantirCatalogos()]);
  if (seq !== comSeqMeu || !comViva(marca)) return;
  comEscrever("comMeuMsg", "", false);
  if (prefs.sucesso === false || !Array.isArray(prefs.categorias)) { comEscrever("comMeuMsg", comMsgErro(prefs), true); }
  else { comPrefs = prefs; comPintarPreferencias(); }
  comPintarComunicados(recebidos);
}
function comCanaisDaTela() {
  const canais = comPrefs && Array.isArray(comPrefs.canais) ? comPrefs.canais.filter(c => c && COM_CODIGO.test(String(c.codigo))) : [];
  return canais;
}
function comPintarPreferencias() {
  const cx = comEl("comMeuPrefs");
  if (!cx || !comPrefs) return;
  const canais = comCanaisDaTela();
  const avisos = [];
  if (!comPrefs.temEmail) avisos.push("Seu cadastro não tem e-mail: para receber por e-mail, peça à Secretaria para incluir.");
  if (!comPrefs.aparelhos) avisos.push("Para receber no celular, ative os avisos neste aparelho (botão 🔔 no topo da tela).");
  const cats = comPrefs.categorias.filter(c => c && COM_CODIGO.test(String(c.categoria)));
  cx.innerHTML = `${avisos.map(a => `<p class="subtitle psc-aviso">${escaparHtmlEbd(a)}</p>`).join("")}
    ${cats.map(c => `<fieldset class="com-cat"><legend>${escaparHtmlEbd(c.rotulo)}</legend>
      <p class="subtitle">${escaparHtmlEbd(c.descricao)}</p>
      ${c.obrigatoria ? `<p class="com-obrigatoria">✅ Chega sempre, por todo canal que você tiver: é obrigação do Estatuto. Não precisa marcar nada.</p>`
        : `<details class="com-autorizacao"><summary>Ler a autorização</summary><p class="com-texto">${escaparHtmlEbd(c.texto)}</p><p class="subtitle">Texto da versão ${escaparHtmlEbd(c.versao)}.</p></details>
      <div class="com-canais">${canais.map(k => {
        const v = c.canais && c.canais[k.codigo] ? c.canais[k.codigo] : {};
        return `<label class="com-canal"><input type="checkbox" id="comPref_${escaparHtmlEbd(c.categoria)}_${escaparHtmlEbd(k.codigo)}" ${v.concedido ? "checked" : ""}> ${escaparHtmlEbd(k.rotulo)}</label>`;
      }).join("")}</div>`}
    </fieldset>`).join("")}
    <p class="subtitle">Marcar uma opção é autorizar, nos termos do texto acima. Você pode desmarcar quando quiser, aqui ou pelo link "não quero mais receber" de cada e-mail.</p>
    <div class="psc-acoes"><button type="button" class="btn-confirmar" data-on-click="comSalvarPreferenciasAcao" data-args-click="${argsAttr(ARG.elemento)}">💾 Salvar minhas escolhas</button></div>`;
}
async function comSalvarPreferenciasAcao(botao) {
  if (!comPrefs || !comMeuVisivel()) return;
  const mudancas = [];
  for (const c of comPrefs.categorias) {
    if (!c || c.obrigatoria || !COM_CODIGO.test(String(c.categoria))) continue;
    for (const k of comCanaisDaTela()) {
      const el = comEl(`comPref_${c.categoria}_${k.codigo}`);
      if (!el) continue;
      const antes = !!(c.canais && c.canais[k.codigo] && c.canais[k.codigo].concedido);
      if (el.checked !== antes) mudancas.push({ canal: k.codigo, categoria: c.categoria, concedido: el.checked, hash: c.hash });
    }
  }
  if (!mudancas.length) { comEscrever("comMeuMsg", "Nada mudou: as suas escolhas já estão assim.", false); return; }
  const marca = comMarca("Meu");
  await comProteger(botao, async () => {
    const data = await comPostar("preferencias", { mudancas });
    if (!comViva(marca)) return;
    if (data.sucesso === false) {
      comMostrarResultado(data, "comMeuMsg");
      // o texto mudou: relê (a pessoa lê o texto novo e marca de novo) e o motivo continua escrito depois de reler
      if (data.textoMudou) { await comCarregarMeuPainelAcao(); if (comViva(marca)) comEscrever("comMeuMsg", comMsgErro(data), true); }
      return;
    }
    comPrefs = data; comPintarPreferencias();
    comMostrarResultado({ sucesso: true, mensagem: "Escolhas salvas." }, "comMeuMsg");
  }, "preferencias");
}
function comPintarComunicados(data) {
  const cx = comEl("comMeuComunicados");
  if (!cx) return;
  if (!data || data.sucesso === false || !Array.isArray(data.comunicados)) { cx.textContent = comMsgErro(data); return; }
  if (!data.comunicados.length) { cx.innerHTML = `<p class="subtitle">Nenhum comunicado recebido ainda.</p>`; return; }
  cx.innerHTML = data.comunicados.map(c => {
    const id = comInteiro(c.envioId);
    const ciencia = c.pedeCiencia
      ? (c.cienciaEm ? `<p class="subtitle">✅ Ciência registrada em ${comData(c.cienciaEm)}.</p>`
        : (id ? `<div class="psc-acoes"><button type="button" class="btn-confirmar" data-on-click="comCienciaAcao" data-args-click="${argsAttr(id, ARG.elemento)}">${c.categoria === "CRISE" ? "✔️ Li o aviso" : "✔️ Recebi a convocação"}</button></div>` : ""))
      : "";
    return `<article class="com-comunicado"><h4>${escaparHtmlEbd(c.titulo)}</h4>
      <p class="subtitle">${escaparHtmlEbd(c.categoriaRotulo || comRotuloCategoria(c.categoria))} · ${comData(c.recebidoEm)}</p>
      <div class="com-texto">${escaparHtmlEbd(c.texto)}</div>${ciencia}</article>`;
  }).join("");
}
async function comCienciaAcao(envioId, botao) {
  const id = comInteiro(envioId);
  if (!id || !comMeuVisivel()) return;
  const marca = comMarca("Meu");
  await comProteger(botao, async () => {
    const data = await comPostar("ciencia", { envioId: id });
    if (!comViva(marca)) return;
    if (data.sucesso === false) { comMostrarResultado(data, "comMeuMsg"); return; }
    comPintarComunicados(data);
    comMostrarResultado({ sucesso: true, mensagem: "Ciência registrada. Obrigado." }, "comMeuMsg");
  }, `ciencia-${id}`);
}

// ============================================================================
// ABA DA LIDERANÇA
// ============================================================================
async function comAbrirAba() {
  comVerificarDono();
  comMostrarPilulasDoGeral(comEhGeral());   // enquanto o catálogo não chega, as pílulas do nível geral não aparecem
  const marca = comMarca("Ges");
  const cat = await comGarantirCatalogos();
  if (!comViva(marca)) return;
  // o catálogo não veio (rede, prazo, servidor): é falha, não "sem acesso" — o motivo, e tocar na aba de novo tenta outra vez
  if (!cat) { comMostrar("comSemAcesso", false); comMostrar("comConteudo", false); comEscrever("comGesMsg", "Não foi possível abrir os comunicados agora. Verifique a internet e toque na aba de novo.", true); return; }
  comEscrever("comGesMsg", "", false);
  if (!comEhGestao()) { comMostrar("comSemAcesso", true); comMostrar("comConteudo", false); comMostrarPilulasDoGeral(false); return; }
  comMostrar("comSemAcesso", false); comMostrar("comConteudo", true);
  comMostrarPilulasDoGeral(comEhGeral());
  if ((comSecaoAtual === "modelos" || comSecaoAtual === "ficha") && !comEhGeral()) comSecaoAtual = "enviar";
  await comMostrarSecaoAcao(comSecaoAtual);
}
function comAplicarSecao(secao) {
  comSecaoAtual = secao;
  COM_SECOES.forEach(s => {
    comMostrar(`comSecao${s[0].toUpperCase()}${s.slice(1)}`, s === secao);
    const b = comEl(`btnComSecao${s[0].toUpperCase()}${s.slice(1)}`);
    if (b) { b.classList.toggle("ativo", s === secao); b.setAttribute("aria-pressed", s === secao ? "true" : "false"); }
  });
}
async function comMostrarSecaoAcao(secao) {
  const s = COM_SECOES.includes(secao) ? secao : "enviar";
  if ((s === "modelos" || s === "ficha") && !comEhGeral()) return;   // Modelos e Ficha em papel: só o nível geral
  comAplicarSecao(s);
  if (s === "enviar") await comCarregarEnviar();
  if (s === "envios") await comCarregarEnviosAcao();
  if (s === "modelos") await comCarregarModelos();
  if (s === "ficha") comPintarFicha();
}

// ---- Enviar: modelo + grupo + contagem ----
async function comCarregarEnviar() {
  const marca = comMarca("Ges");
  const seq = ++comSeqGes;
  comEscrever("comEnvMsg", "Carregando…", false);
  const [m, o, g] = await Promise.all([comObter("modelos"), comObter("opcoes"), comObter("grupos")]);
  if (seq !== comSeqGes || !comViva(marca) || comSecaoAtual !== "enviar") return;
  if (m.sucesso === false || o.sucesso === false) { comEscrever("comEnvMsg", comMsgErro(m.sucesso === false ? m : o), true); return; }
  comEscrever("comEnvMsg", "", false);
  comModelos = Array.isArray(m.modelos) ? m.modelos : [];
  comOpcoes = o;
  comGrupos = g.sucesso === false || !Array.isArray(g.grupos) ? [] : g.grupos;
  comPrevia = null;
  comPintarEnviar();
}
const comLista = (v) => (Array.isArray(v) ? v : []);
function comCaixas(prefixo, itens, chave) {
  return itens.map(x => {
    const valor = chave === "sigla" ? String(x.sigla) : comInteiro(x.id);
    if (chave === "sigla" ? !COM_CODIGO.test(valor) : !valor) return "";
    return `<label class="com-canal"><input type="checkbox" id="${prefixo}_${escaparHtmlEbd(valor)}" data-on-change="comMudouGrupoAcao"> ${escaparHtmlEbd(x.nome)}</label>`;
  }).join("");
}
function comPintarEnviar() {
  const cx = comEl("comEnvForm");
  if (!cx || !comOpcoes) return;
  const aprovados = comModelos.filter(m => m && m.status === "APROVADO" && comInteiro(m.modeloId));
  cx.innerHTML = `
    <label for="comEnvModelo">Modelo (só os aprovados)</label>
    <select id="comEnvModelo" data-on-change="comMudouModeloAcao"><option value="">— escolha —</option>${aprovados.map(m =>
      `<option value="${comInteiro(m.modeloId)}">${escaparHtmlEbd(m.categoriaRotulo || m.categoria)} — ${escaparHtmlEbd(m.titulo)} (v${comInteiro(m.versao)})</option>`).join("")}</select>
    <div id="comEnvModeloVer"></div>
    <h4>Quem recebe</h4>
    ${comGrupos.length ? `<label for="comGrpSalvos">Usar um grupo guardado</label><div class="psc-acoes"><select id="comGrpSalvos"><option value="">— escolha —</option>${comGrupos.map(g =>
      `<option value="${comInteiro(g.audienciaId)}">${escaparHtmlEbd(g.nome)}</option>`).join("")}</select>
      <button type="button" class="btn-confirmar btn-secundario" data-on-click="comUsarGrupoAcao">Usar</button>
      <button type="button" class="btn-confirmar btn-secundario" data-on-click="comExcluirGrupoAcao" data-args-click="${argsAttr(ARG.elemento)}">Apagar</button></div>` : ""}
    <label for="comGrpTipo">Território</label>
    <select id="comGrpTipo" data-on-change="comMudouTerritorioAcao">
      <option value="TODAS">${comOpcoes.geral ? "Todas as congregações" : "Todo o meu território"}</option>
      <option value="CONGREGACAO">Congregações escolhidas</option><option value="AREA">Áreas escolhidas</option><option value="REGIAO">Regiões escolhidas</option></select>
    <div id="comGrpIds" class="com-canais"></div>
    ${comLista(comOpcoes.cargos).length ? `<p class="subtitle">Cargo (nenhum marcado = todos)</p><div class="com-canais">${comCaixas("comGrpCargo", comLista(comOpcoes.cargos), "sigla")}</div>` : ""}
    ${comLista(comOpcoes.departamentos).length ? `<p class="subtitle">Departamento (nenhum marcado = todos)</p><div class="com-canais">${comCaixas("comGrpDep", comLista(comOpcoes.departamentos), "id")}</div>` : ""}
    <div class="com-canais">
      <label class="com-canal"><input type="checkbox" id="comGrpLideranca" data-on-change="comMudouGrupoAcao"> Só quem tem liderança ativa</label>
      <label class="com-canal"><input type="checkbox" id="comGrpEbd" data-on-change="comMudouGrupoAcao"> Só professores de EBD</label>
      ${comOpcoes.geral ? `<label class="com-canal"><input type="checkbox" id="comGrpAssembleia" data-on-change="comMudouGrupoAcao"> Só quem tem direito a voto na Assembleia Geral</label>` : ""}</div>
    <label for="comGrpFormacao">Formação vencida ou vencendo em até … dias (vazio = não filtrar; 0 = só as vencidas)</label>
    <input type="number" id="comGrpFormacao" min="0" max="365" inputmode="numeric" data-on-input="comMudouGrupoAcao">
    <label for="comGrpHabilitacao">Habilitação de voluntário vencida ou vencendo em até … dias (vazio = não filtrar)</label>
    <input type="number" id="comGrpHabilitacao" min="0" max="365" inputmode="numeric" data-on-input="comMudouGrupoAcao">
    <p class="subtitle">Ficam sempre de fora: quem não está ativo, menores de 18 anos e quem pediu a exclusão dos dados. O grupo é calculado na hora, dentro do seu território.</p>
    <div class="psc-acoes">
      <button type="button" class="btn-confirmar btn-secundario" data-on-click="comPreviaAcao" data-args-click="${argsAttr(ARG.elemento)}">👥 Ver quantas pessoas</button>
      <button type="button" class="btn-confirmar" id="comBtnEnviar" disabled data-on-click="comEnviarAcao" data-args-click="${argsAttr(ARG.elemento)}">📤 Enviar</button></div>
    <label for="comGrpNome">Guardar este grupo com o nome</label>
    <div class="psc-acoes"><input type="text" id="comGrpNome" maxlength="100" placeholder="Ex.: Diáconos da Área 1">
      <button type="button" class="btn-confirmar btn-secundario" data-on-click="comSalvarGrupoAcao" data-args-click="${argsAttr(ARG.elemento)}">💾 Guardar</button></div>`;
  comPintarIds();
  const prev = comEl("comEnvPrevia"); if (prev) prev.innerHTML = "";
}
function comPintarIds(marcados) {
  const cx = comEl("comGrpIds");
  if (!cx || !comOpcoes) return;
  const tipo = comValor("comGrpTipo");
  const lista = tipo === "CONGREGACAO" ? comOpcoes.congregacoes : tipo === "AREA" ? comOpcoes.areas : tipo === "REGIAO" ? comOpcoes.regioes : [];
  cx.innerHTML = comCaixas("comGrpTerr", comLista(lista), "id");
  for (const id of marcados || []) { const el = comEl(`comGrpTerr_${comInteiro(id)}`); if (el) el.checked = true; }
}
function comMarcadosDe(prefixo, itens, chave) {
  return comLista(itens).map(x => (chave === "sigla" ? String(x.sigla) : comInteiro(x.id))).filter(v => (chave === "sigla" ? COM_CODIGO.test(v) : v) && comMarcado(`${prefixo}_${v}`));
}
function comDias(id) { const t = comValor(id); if (t === "") return null; const n = Number(t); return Number.isInteger(n) ? n : NaN; }
function comCriterios() {
  const tipo = ["TODAS", "CONGREGACAO", "AREA", "REGIAO"].includes(comValor("comGrpTipo")) ? comValor("comGrpTipo") : "TODAS";
  const lista = tipo === "CONGREGACAO" ? comOpcoes.congregacoes : tipo === "AREA" ? comOpcoes.areas : tipo === "REGIAO" ? comOpcoes.regioes : [];
  return {
    territorio: { tipo, ids: tipo === "TODAS" ? [] : comMarcadosDe("comGrpTerr", lista, "id") },
    cargos: comMarcadosDe("comGrpCargo", comOpcoes.cargos, "sigla"), departamentos: comMarcadosDe("comGrpDep", comOpcoes.departamentos, "id"),
    lideranca: comMarcado("comGrpLideranca"), ebdProfessores: comMarcado("comGrpEbd"), assembleiaGeral: comMarcado("comGrpAssembleia"),
    formacaoVencendoDias: comDias("comGrpFormacao"), habilitacaoVencendoDias: comDias("comGrpHabilitacao")
  };
}
function comModeloEscolhido() { const id = comInteiro(comValor("comEnvModelo")); return comModelos.find(m => comInteiro(m.modeloId) === id && m.status === "APROVADO") || null; }
// mudou o modelo ou o grupo: a contagem anterior não vale mais (o "Enviar" volta a pedir uma contagem nova)
function comInvalidarPrevia() {
  comPrevia = null;
  const b = comEl("comBtnEnviar"); if (b) b.disabled = true;
  const prev = comEl("comEnvPrevia"); if (prev) prev.innerHTML = "";
}
function comMudouGrupoAcao() { comInvalidarPrevia(); }
function comMudouTerritorioAcao() { comPintarIds(); comInvalidarPrevia(); }
function comMudouModeloAcao() {
  comInvalidarPrevia();
  const cx = comEl("comEnvModeloVer");
  const m = comModeloEscolhido();
  if (!cx) return;
  cx.innerHTML = m ? `<div class="com-comunicado"><h4>${escaparHtmlEbd(m.titulo)}</h4><div class="com-texto">${escaparHtmlEbd(m.corpo)}</div>
    <p class="subtitle">{{primeiro_nome}} e {{congregacao}} são trocados pelo nome e pela congregação de cada pessoa.${m.categoria === "CONVOCACAO" ? " Convocação oficial: vai a todos do grupo por todo canal, sem pedir consentimento." : ""}</p></div>` : "";
}
function comChaveDaPrevia(modeloId, criterios) { return JSON.stringify([modeloId, criterios]); }
async function comPreviaAcao(botao) {
  const m = comModeloEscolhido();
  if (!m) { comEscrever("comEnvMsg", "Escolha o modelo.", true); return; }
  const criterios = comCriterios();
  if (Number.isNaN(criterios.formacaoVencendoDias) || Number.isNaN(criterios.habilitacaoVencendoDias)) { comEscrever("comEnvMsg", "Os dias são um número inteiro de 0 a 365.", true); return; }
  const marca = comMarca("Ges");
  await comProteger(botao, async () => {
    const data = await comPostar("previa", { categoria: m.categoria, criterios });
    if (!comViva(marca)) return;
    const cx = comEl("comEnvPrevia");
    if (data.sucesso === false) { comMostrarResultado(data, "comEnvMsg"); comInvalidarPrevia(); return; }
    comEscrever("comEnvMsg", "", false);
    const total = comInteiro(data.total) || 0;
    const k = data.canais && typeof data.canais === "object" ? data.canais : {};
    const linha = (rotulo, c) => (c ? `<li>${rotulo}: <strong>${Number(c.receberao) || 0}</strong> recebem; ${Number(c.semConsentimento) || 0} sem autorização; ${Number(c.semContato) || 0} sem ${rotulo === "E-mail" ? "e-mail" : "aparelho"}</li>` : "");
    const semNascimento = comInteiro(data.semNascimento);
    if (cx) cx.innerHTML = `<div class="com-comunicado"><p><strong>${total}</strong> pessoa(s) no grupo: ${escaparHtmlEbd(data.grupo || "")}</p>
      <ul>${linha("E-mail", k.EMAIL)}${linha("Celular", k.PUSH)}</ul>${semNascimento ? `<p class="subtitle psc-aviso">${semNascimento} sem data de nascimento no cadastro ficaram de fora (peça à Secretaria para completar).</p>` : ""}<p class="subtitle">Todas veem no sininho do sistema. O e-mail sai aos poucos (o serviço aceita 100 por hora).</p></div>`;
    comPrevia = total ? { chave: comChaveDaPrevia(comInteiro(m.modeloId), criterios), total } : null;
    const b = comEl("comBtnEnviar"); if (b) b.disabled = !comPrevia;
  }, "previa");
}
async function comEnviarAcao(botao) {
  const m = comModeloEscolhido();
  if (!m || !comPrevia) return;
  const criterios = comCriterios();
  if (comPrevia.chave !== comChaveDaPrevia(comInteiro(m.modeloId), criterios)) { comInvalidarPrevia(); comEscrever("comEnvMsg", "O grupo mudou: toque em \"Ver quantas pessoas\" de novo.", true); return; }
  if (!(await confirmarAcao(`Enviar "${String(m.titulo)}" a ${comPrevia.total} pessoa(s)? O sininho e o celular saem agora e os e-mails, aos poucos. Dá para cancelar o que ainda estiver na fila, mas não o que já foi entregue.`, "Enviar"))) return;
  const marca = comMarca("Ges");
  await comProteger(botao, async () => {
    const data = await comPostar("enviar", { modeloId: comInteiro(m.modeloId), criterios });
    if (!comViva(marca)) return;
    if (data.sucesso === false) { comMostrarResultado(data, "comEnvMsg"); if (data.tempoEsgotado || data.falhaDeRede) comInvalidarPrevia(); return; }
    comInvalidarPrevia();
    comMostrarResultado({ sucesso: true, mensagem: data.repetido ? "Este envio já tinha sido feito há poucos minutos: é o mesmo (nada foi mandado de novo)." : "Enviado. Acompanhe a entrega em Envios." }, "comEnvMsg");
    const cx = comEl("comEnvResultado");
    if (cx) cx.innerHTML = comHtmlRelatorio(data);
  }, "enviar");
  // o comProteger devolve o botão como estava; depois de enviar (ou do prazo esgotado) a contagem não vale mais: o "Enviar" fica desabilitado até uma contagem nova
  const b = comEl("comBtnEnviar"); if (b && !comEmCurso.has("enviar")) b.disabled = !comPrevia;
}
async function comSalvarGrupoAcao(botao) {
  const nome = comValor("comGrpNome");
  if (nome.length < 3) { comEscrever("comEnvMsg", "Dê um nome ao grupo (3 letras ou mais).", true); return; }
  const marca = comMarca("Ges");
  await comProteger(botao, async () => {
    const data = await comPostar("grupo", { nome, criterios: comCriterios() });
    if (!comViva(marca)) return;
    comMostrarResultado(data.sucesso === false ? data : { sucesso: true, mensagem: "Grupo guardado." }, "comEnvMsg");
    if (data.sucesso !== false) { const g = await comObter("grupos"); if (comViva(marca) && g.sucesso !== false) { comGrupos = comLista(g.grupos); comRepintarEnviar(); } }
  }, "grupo");
}
// repinta o formulário (a lista de grupos guardados mudou) sem perder o modelo escolhido nem o grupo montado: senão a próxima contagem seria do território inteiro
function comRepintarEnviar() {
  const sel = comModeloEscolhido();
  const criterios = comEl("comGrpTipo") ? comCriterios() : null;
  comPintarEnviar();
  if (sel && comEl("comEnvModelo")) { comEl("comEnvModelo").value = String(comInteiro(sel.modeloId)); comMudouModeloAcao(); }
  if (criterios) comAplicarCriterios(criterios);
  comInvalidarPrevia();
}
function comUsarGrupoAcao() {
  const id = comInteiro(comValor("comGrpSalvos"));
  const g = comGrupos.find(x => comInteiro(x.audienciaId) === id);
  if (!g || !g.criterios || typeof g.criterios !== "object") return;
  comAplicarCriterios(g.criterios);
  comInvalidarPrevia();
  comEscrever("comEnvMsg", "Grupo carregado: confira e toque em \"Ver quantas pessoas\".", false);
}
function comAplicarCriterios(c) {
  const tipo = c.territorio && ["TODAS", "CONGREGACAO", "AREA", "REGIAO"].includes(c.territorio.tipo) ? c.territorio.tipo : "TODAS";
  comEl("comGrpTipo").value = tipo;
  comPintarIds(c.territorio && Array.isArray(c.territorio.ids) ? c.territorio.ids : []);
  comLista(comOpcoes.cargos).forEach(x => { const el = comEl(`comGrpCargo_${x.sigla}`); if (el) el.checked = comLista(c.cargos).includes(x.sigla); });
  comLista(comOpcoes.departamentos).forEach(x => { const el = comEl(`comGrpDep_${comInteiro(x.id)}`); if (el) el.checked = comLista(c.departamentos).includes(comInteiro(x.id)); });
  [["comGrpLideranca", c.lideranca], ["comGrpEbd", c.ebdProfessores], ["comGrpAssembleia", c.assembleiaGeral]].forEach(([id2, v]) => { const el = comEl(id2); if (el) el.checked = v === true; });
  [["comGrpFormacao", c.formacaoVencendoDias], ["comGrpHabilitacao", c.habilitacaoVencendoDias]].forEach(([id2, v]) => { const el = comEl(id2); if (el) el.value = Number.isInteger(v) ? String(v) : ""; });
}
async function comExcluirGrupoAcao(botao) {
  const id = comInteiro(comValor("comGrpSalvos"));
  if (!id) return;
  if (!(await confirmarAcao("Apagar este grupo guardado? (Os envios já feitos não mudam.)", "Apagar"))) return;
  const marca = comMarca("Ges");
  await comProteger(botao, async () => {
    const data = await comPostar("excluir-grupo", { audienciaId: id });
    if (!comViva(marca)) return;
    comMostrarResultado(data.sucesso === false ? data : { sucesso: true, mensagem: "Grupo apagado." }, "comEnvMsg");
    if (data.sucesso !== false) { comGrupos = comGrupos.filter(g => comInteiro(g.audienciaId) !== id); comRepintarEnviar(); }
  }, "grupo");
}

// ---- Envios e relatório ----
async function comCarregarEnviosAcao() {
  const marca = comMarca("Ges");
  const seq = ++comSeqGes;
  const data = await comObter("envios");
  if (seq !== comSeqGes || !comViva(marca) || comSecaoAtual !== "envios") return;
  const cx = comEl("comEnviosLista");
  if (!cx) return;
  if (data.sucesso === false || !Array.isArray(data.envios)) { cx.textContent = comMsgErro(data); return; }
  comEnvios = data.envios;
  cx.innerHTML = comEnvios.length ? comEnvios.map(e => {
    const id = comInteiro(e.envioId);
    if (!id) return "";
    const st = e.status === "FILA" ? `⏳ na fila (${Number(e.naFila) || 0} a sair)` : e.status === "CANCELADO" ? "🚫 cancelado" : "✅ concluído";
    return `<article class="com-comunicado"><h4>${escaparHtmlEbd(e.titulo)}</h4>
      <p class="subtitle">${escaparHtmlEbd(e.categoriaRotulo)} · ${comData(e.criadoEm)} · ${escaparHtmlEbd(e.enviadoPor || "")} · ${Number(e.total) || 0} pessoa(s) · ${st}</p>
      <p class="subtitle">${escaparHtmlEbd(e.grupo)}</p>
      <div class="psc-acoes"><button type="button" class="btn-confirmar btn-secundario" data-on-click="comVerRelatorioAcao" data-args-click="${argsAttr(id, ARG.elemento)}">📊 Ver relatório</button>
      ${e.status === "FILA" && e.categoria !== "CRISE" ? `<button type="button" class="btn-confirmar btn-secundario" data-on-click="comCancelarEnvioAcao" data-args-click="${argsAttr(id, ARG.elemento)}">🚫 Cancelar o que está na fila</button>` : ""}</div></article>`;
  }).join("") : `<p class="subtitle">Nenhum envio ainda.</p>`;
}
function comHtmlRelatorio(r) {
  if (!r || !r.envio) return "";
  const e = r.envio;
  const canais = r.canais && typeof r.canais === "object" ? r.canais : {};
  const rot = { SININHO: "Sininho", EMAIL: "E-mail", PUSH: "Celular" };
  const linhas = ["SININHO", "EMAIL", "PUSH"].filter(c => canais[c]).map(c => `<li><strong>${rot[c]}</strong>: ${Object.entries(canais[c]).filter(([s]) => COM_CODIGO.test(s))
    .map(([s, n]) => `${escaparHtmlEbd(comRotuloSituacao(s))} ${Number(n) || 0}`).join(" · ")}</li>`).join("");
  const nao = Array.isArray(r.naoAlcancados) ? r.naoAlcancados : null;
  return `<div class="com-comunicado"><h4>${escaparHtmlEbd(e.titulo)} (v${comInteiro(e.versao)})</h4>
    <p class="subtitle">${escaparHtmlEbd(e.categoriaRotulo)} · ${comData(e.criadoEm)} · ${Number(e.total) || 0} pessoa(s) · ${escaparHtmlEbd(e.grupo)}</p>
    <ul>${linhas}</ul>
    <p>Leram no sininho: <strong>${Number(r.lidos) || 0}</strong>${e.categoria === "CONVOCACAO" || e.categoria === "CRISE" ? ` · Deram ciência (${e.categoria === "CRISE" ? '"Li o aviso"' : '"Recebi a convocação"'}): <strong>${Number(r.ciencia) || 0}</strong>` : ""}</p>
    ${nao ? (nao.length ? `<h4>Não alcançados (nem e-mail, nem celular, nem leitura): procure por telefone</h4>${r.naoAlcancadosCortado
      ? `<p class="subtitle psc-aviso">Mostrando ${nao.length} de ${Number(r.naoAlcancadosTotal) || nao.length}: a lista é cortada; procure os primeiros e abra o relatório de novo depois.</p>` : ""}<ul>${nao.map(p => {
      const tel = p.telefone ? String(p.telefone).replace(/\D/g, "").slice(0, 15) : "";
      return `<li>${escaparHtmlEbd(p.nome)} — ${escaparHtmlEbd(p.congregacao || "")}${tel ? ` — <a href="tel:${escaparHtmlEbd(tel)}">${escaparHtmlEbd(p.telefone)}</a>` : ""}</li>`;
    }).join("")}</ul>` : `<p class="subtitle">Todos foram alcançados por algum canal ou leram.</p>`) : ""}</div>`;
}
async function comVerRelatorioAcao(envioId, botao) {
  const id = comInteiro(envioId);
  if (!id) return;
  const marca = comMarca("Ges");
  const seq = ++comSeqRel;
  await comProteger(botao, async () => {
    const data = await comObter(`envio?envioId=${id}`);
    if (seq !== comSeqRel || !comViva(marca)) return;
    const cx = comEl("comRelatorio");
    if (!cx) return;
    if (data.sucesso === false) { cx.textContent = data.httpStatus === 404 ? "Não foi possível abrir este envio." : comMsgErro(data); return; }
    cx.innerHTML = comHtmlRelatorio(data);
    if (typeof cx.scrollIntoView === "function") cx.scrollIntoView({ block: "start" });
  }, `rel-${id}`);
}
async function comCancelarEnvioAcao(envioId, botao) {
  const id = comInteiro(envioId);
  if (!id) return;
  if (!(await confirmarAcao("Cancelar o que ainda está na fila deste envio? O que já foi entregue (e o sininho) fica.", "Cancelar o envio"))) return;
  const marca = comMarca("Ges");
  await comProteger(botao, async () => {
    const data = await comPostar("cancelar", { envioId: id });
    if (!comViva(marca)) return;
    comMostrarResultado(data, "comEnviosMsg");
    await comCarregarEnviosAcao();
  }, `cancelar-${id}`);
}

// ---- Modelos (nível geral) ----
async function comCarregarModelos() {
  const marca = comMarca("Ges");
  const seq = ++comSeqGes;
  const data = await comObter("modelos");
  if (seq !== comSeqGes || !comViva(marca) || comSecaoAtual !== "modelos") return;
  const cx = comEl("comModelosLista");
  if (!cx) return;
  if (data.sucesso === false || !Array.isArray(data.modelos)) { cx.textContent = comMsgErro(data); return; }
  comModelos = data.modelos;
  const rotStatus = { RASCUNHO: "📝 rascunho", APROVADO: "✅ aprovado (em uso)", ARQUIVADO: "🗄️ arquivado" };
  cx.innerHTML = comModelos.length ? comModelos.map(m => {
    const id = comInteiro(m.modeloId);
    if (!id) return "";
    const botoes = m.status === "RASCUNHO"
      ? `<button type="button" class="btn-confirmar btn-secundario" data-on-click="comEditarModeloAcao" data-args-click="${argsAttr(id)}">✏️ Editar</button>
         <button type="button" class="btn-confirmar" data-on-click="comAprovarModeloAcao" data-args-click="${argsAttr(id, ARG.elemento)}">✅ Aprovar</button>
         <button type="button" class="btn-confirmar btn-secundario" data-on-click="comArquivarModeloAcao" data-args-click="${argsAttr(id, ARG.elemento)}">🗑️ Apagar rascunho</button>`
      : m.status === "APROVADO"
        ? `<button type="button" class="btn-confirmar btn-secundario" data-on-click="comEditarModeloAcao" data-args-click="${argsAttr(id)}">✏️ Corrigir (versão nova)</button>
           <button type="button" class="btn-confirmar btn-secundario" data-on-click="comArquivarModeloAcao" data-args-click="${argsAttr(id, ARG.elemento)}">🗄️ Arquivar</button>` : "";
    return `<article class="com-comunicado"><h4>${escaparHtmlEbd(m.titulo)} (v${comInteiro(m.versao)})</h4>
      <p class="subtitle">${escaparHtmlEbd(m.categoriaRotulo || m.categoria)} · ${escaparHtmlEbd(rotStatus[m.status] || m.status)}${m.aprovadoPor ? ` · aprovado por ${escaparHtmlEbd(m.aprovadoPor)} em ${comData(m.aprovadoEm)}` : ""}</p>
      <div class="com-texto">${escaparHtmlEbd(m.corpo)}</div><div class="psc-acoes">${botoes}</div></article>`;
  }).join("") : `<p class="subtitle">Nenhum modelo ainda: escreva o primeiro acima.</p>`;
  if (!comEl("comModeloCategoria")) comPintarFormModelo(null);
}
function comPintarFormModelo(m) {
  const cx = comEl("comModeloForm");
  if (!cx) return;
  comModeloChave = m ? String(m.chave || "") : null;
  const cats = comCat ? comCat.categorias : [];
  cx.innerHTML = `<h4>${m ? (m.status === "RASCUNHO" ? "Editar o rascunho" : "Corrigir: a correção vira a versão seguinte (a atual continua até a nova ser aprovada)") : "Novo modelo"}</h4>
    <label for="comModeloCategoria">Categoria</label>
    <select id="comModeloCategoria">${cats.map(c => `<option value="${escaparHtmlEbd(c.codigo)}" ${m && m.categoria === c.codigo ? "selected" : ""}>${escaparHtmlEbd(c.rotulo)}</option>`).join("")}</select>
    <label for="comModeloTitulo">Título (assunto do e-mail)</label><input type="text" id="comModeloTitulo" maxlength="150">
    <label for="comModeloCorpo">Texto</label><textarea id="comModeloCorpo" rows="8" maxlength="2000"></textarea>
    <p class="subtitle">Use {{primeiro_nome}} e {{congregacao}} para o sistema preencher. Sem formatação (o texto vai como está). Exemplo: "Paz do Senhor, {{primeiro_nome}}! O congresso de jovens da {{congregacao}} será no sábado, às 19h."</p>
    <div class="psc-acoes"><button type="button" class="btn-confirmar" data-on-click="comSalvarModeloAcao" data-args-click="${argsAttr(ARG.elemento)}">💾 Guardar rascunho</button>
    ${m ? `<button type="button" class="btn-confirmar btn-secundario" data-on-click="comNovoModeloAcao">Cancelar a edição</button>` : ""}</div>`;
  if (m) { comEl("comModeloTitulo").value = String(m.titulo || ""); comEl("comModeloCorpo").value = String(m.corpo || ""); }
}
function comNovoModeloAcao() { comPintarFormModelo(null); }
function comEditarModeloAcao(modeloId) {
  const m = comModelos.find(x => comInteiro(x.modeloId) === comInteiro(modeloId));
  if (!m) return;
  comPintarFormModelo(m);
  const cx = comEl("comModeloForm"); if (cx && typeof cx.scrollIntoView === "function") cx.scrollIntoView({ block: "start" });
}
async function comSalvarModeloAcao(botao) {
  const dados = { categoria: comValor("comModeloCategoria"), titulo: comValor("comModeloTitulo"), corpo: comEl("comModeloCorpo") ? String(comEl("comModeloCorpo").value || "") : "" };
  if (comModeloChave) dados.chave = comModeloChave;
  const marca = comMarca("Ges");
  await comProteger(botao, async () => {
    const data = await comPostar("modelo", dados);
    if (!comViva(marca)) return;
    comMostrarResultado(data.sucesso === false ? data : { sucesso: true, mensagem: "Rascunho guardado. Confira e toque em Aprovar para poder enviar." }, "comModelosMsg");
    if (data.sucesso !== false) { comPintarFormModelo(null); await comCarregarModelos(); }
  }, "modelo");
}
async function comAprovarModeloAcao(modeloId, botao) {
  const id = comInteiro(modeloId);
  const m = comModelos.find(x => comInteiro(x.modeloId) === id);
  if (!m) return;
  if (!(await confirmarAcao(`Aprovar "${String(m.titulo)}"? Depois de aprovado o texto não muda (corrigir cria a versão seguinte), e a versão aprovada anterior deste modelo é arquivada.`, "Aprovar"))) return;
  const marca = comMarca("Ges");
  await comProteger(botao, async () => {
    // a impressão digital do texto que a pessoa viu na lista: se o rascunho mudou enquanto ela decidia, o servidor recusa (409) e a lista é relida
    const data = await comPostar("aprovar-modelo", { modeloId: id, hash: String(m.hash == null ? "" : m.hash) });
    if (!comViva(marca)) return;
    comMostrarResultado(data.sucesso === false ? (data.httpStatus === 409 ? Object.assign({}, data, { mensagem: `${comMsgErro(data)} A lista foi atualizada: confira o texto antes de aprovar.` }) : data)
      : { sucesso: true, mensagem: "Modelo aprovado: já pode ser enviado." }, "comModelosMsg");
    await comCarregarModelos();
  }, `modelo-${id}`);
}
async function comArquivarModeloAcao(modeloId, botao) {
  const id = comInteiro(modeloId);
  const m = comModelos.find(x => comInteiro(x.modeloId) === id);
  if (!m) return;
  const rascunho = m.status === "RASCUNHO";
  if (!(await confirmarAcao(rascunho ? "Apagar este rascunho?" : "Arquivar este modelo? Ele deixa de aparecer para envio (os envios já feitos continuam com o texto dele).", rascunho ? "Apagar" : "Arquivar"))) return;
  const marca = comMarca("Ges");
  await comProteger(botao, async () => {
    const data = await comPostar("arquivar-modelo", { modeloId: id });
    if (!comViva(marca)) return;
    comMostrarResultado(data.sucesso === false ? data : { sucesso: true, mensagem: rascunho ? "Rascunho apagado." : "Modelo arquivado." }, "comModelosMsg");
    await comCarregarModelos();
  }, `modelo-${id}`);
}

// ---- Ficha em papel ----
function comPintarFicha() {
  const cx = comEl("comFichaForm");
  if (!cx || !comCat) return;
  const cats = comCat.categorias.filter(c => !c.obrigatoria);
  cx.innerHTML = `<label for="comFichaMatricula">Matrícula da pessoa</label><input type="number" id="comFichaMatricula" min="1" inputmode="numeric">
    <label for="comFichaCategoria">Categoria</label><select id="comFichaCategoria">${cats.map(c => `<option value="${escaparHtmlEbd(c.codigo)}">${escaparHtmlEbd(c.rotulo)}</option>`).join("")}</select>
    <label for="comFichaCanal">Canal</label><select id="comFichaCanal">${comCat.canais.map(c => `<option value="${escaparHtmlEbd(c.codigo)}">${escaparHtmlEbd(c.rotulo)}</option>`).join("")}</select>
    <fieldset class="com-cat"><legend>O que a pessoa marcou na ficha</legend>
      <label class="com-canal"><input type="radio" name="comFichaSim" id="comFichaSim"> Autorizou</label>
      <label class="com-canal"><input type="radio" name="comFichaSim" id="comFichaNao"> Não autorizou</label></fieldset>
    <label for="comFichaData">Data da ficha</label><input type="date" id="comFichaData">
    <label for="comFichaReferencia">Onde a ficha está guardada (número da ficha, do livro ou da pasta)</label><input type="text" id="comFichaReferencia" maxlength="100" spellcheck="false" placeholder="Ex.: Livro 3, folha 12">
    <div class="psc-acoes"><button type="button" class="btn-confirmar" data-on-click="comEnviarFichaAcao" data-args-click="${argsAttr(ARG.elemento)}">💾 Lançar a ficha</button></div>`;
}
async function comEnviarFichaAcao(botao) {
  const membroId = comInteiro(comValor("comFichaMatricula"));
  const sim = comMarcado("comFichaSim"), nao = comMarcado("comFichaNao");
  if (!membroId) { comEscrever("comFichaMsg", "Informe a matrícula.", true); return; }
  if (!sim && !nao) { comEscrever("comFichaMsg", "Marque se a pessoa autorizou ou não.", true); return; }
  if (!comValor("comFichaData")) { comEscrever("comFichaMsg", "Informe a data da ficha.", true); return; }
  const fichaReferencia = comValor("comFichaReferencia");
  if (fichaReferencia.length < 3 || fichaReferencia.length > 100) { comEscrever("comFichaMsg", "Informe onde a ficha está guardada (número da ficha, do livro ou da pasta; de 3 a 100 caracteres).", true); return; }
  const marca = comMarca("Ges");
  await comProteger(botao, async () => {
    // lançar o consentimento de outra pessoa é ato do nível geral, com a confirmação reforçada (428: o comRequisitar pede e repete uma vez)
    const data = await comPostar("ficha", { membroId, canal: comValor("comFichaCanal"), categoria: comValor("comFichaCategoria"), concedido: sim, dataFicha: comValor("comFichaData"), fichaReferencia });
    if (!comViva(marca)) return;
    comMostrarResultado(data.httpStatus === 404 ? { sucesso: false, mensagem: "Matrícula não encontrada no seu território." } : data, "comFichaMsg");
  }, "ficha");
}

registrarAcoes({
  comAprovarModeloAcao, comArquivarModeloAcao, comCancelarEnvioAcao, comCarregarEnviosAcao, comCarregarMeuPainelAcao, comCienciaAcao, comEditarModeloAcao,
  comEnviarAcao, comEnviarFichaAcao, comExcluirGrupoAcao, comMostrarSecaoAcao, comMudouGrupoAcao, comMudouModeloAcao, comMudouTerritorioAcao, comNovoModeloAcao, comPreviaAcao,
  comSalvarGrupoAcao, comSalvarModeloAcao, comSalvarPreferenciasAcao, comUsarGrupoAcao, comVerRelatorioAcao
});
