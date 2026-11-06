// modulos/territorio.js — v9.5: Mapa territorial e inteligência de expansão. Toda regra mora no servidor (api/shared/territorio.js e territorioDb.js, rota
// /api/territorio); aqui só se monta a tela, na pílula "Território" da aba Expansão (permissão "expansao" ou a CME, como a v9.2):
//  - Mapa: a cobertura por bairro (os membros que moram em cada um, a unidade mais perto, a distância, o descoberto), a densidade por unidade (a distância média e
//    quantos moram mais perto de outra) e a fila dos bairros escritos. Duas formas, escolhidas na hora: "Lista e desenho" (tudo aqui, nada de fora) ou "Mapa do
//    Google" (numa página separada, mapa-territorial.html, presa numa moldura com sandbox — o sistema manda só os pontos e as contagens);
//  - Simulação de emancipação: cada Extensão diante dos critérios ativos (atende, não atende, não dá para medir) e o atalho para o pedido da v9.2;
//  - Bairros (o nível geral): o cadastro, o ponto central, desativar e juntar repetidos;
//  - Critérios: a tabela que o responsável monta (o nível geral muda; os demais leem) e o raio de cobertura;
//  - Pontos das Extensões: o Dirigente da Mãe (ou o nível geral) marca o ponto de cada Extensão.
// Contagem, nunca nome. Todo texto que vem do servidor passa por escaparHtmlEbd; toda resposta confere, depois de cada await, se o login ainda é o mesmo.

let terCatalogos = null;
let terSub = "mapa";
let terMapaDados = null;
let terBairrosLista = [];
let terCriteriosDados = null;
let terExtensoesLista = [];
let terForm = null;            // o formulário aberto: { tipo: "bairro" | "criterio" | "ponto" | "juntar", item }
let terMoldura = null;         // a moldura do mapa do Google aberta: { el, modo, alvoLat, alvoLng, ponto, enviado }
let terOcupado = false;
let terPedidoSub = 0;
let terPedidoOpcoes = 0;
const TER_SUBS = ["mapa", "simulacao", "bairros", "criterios", "pontos"];
const TER_MODO_CHAVE = "ieadespa.territorio.modo";
const terEl = (idEl) => document.getElementById(idEl);
const terH = (v) => escaparHtmlEbd(v == null ? "" : String(v));
const terKm = (v) => (v == null ? "—" : `${String(v).replace(".", ",")} km`);
const terReais = (v) => `R$ ${Number(v || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const TER_SEM_CONEXAO = "<p class='subtitle'>Sem conexão com o servidor. Tente de novo.</p>";
const TER_RESULTADO = { ATENDE: "✅ atende", NAO_ATENDE: "❌ não atende", SEM_DADO: "❔ não dá para medir" };
const TER_SITUACAO = {
  ATENDE_TUDO: "✅ Atende todos os critérios", NAO_ATENDE: "Ainda não atende", SEM_DADO: "Falta dado para medir", SEM_CRITERIOS: "Nenhum critério ativo"
};

const terDono = () => (authToken ? `${authMatricula}|${typeof sessaoDeLiderancaNaTela === "function" && sessaoDeLiderancaNaTela() ? "senha" : "pin"}` : null);
async function terBuscar(caminho) {
  const dono = terDono();
  if (!dono) return null;
  let res;
  try { res = await fetchProtegido(`${API_BASE}/territorio/${caminho}`); } catch (e) { return terDono() === dono ? { semConexao: true } : null; }
  const data = await res.json().catch(() => ({ sucesso: false, mensagem: "Resposta inválida do servidor." }));
  return terDono() === dono ? data : null;
}
async function terPost(acao, corpo, alvoMsg) {
  if (terOcupado) { terMensagem(alvoMsg, "Aguarde: a gravação anterior ainda está em andamento."); return null; }
  terOcupado = true;
  const dono = terDono();
  try {
    let res;
    try { res = await fetchProtegido(`${API_BASE}/territorio/${acao}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo) }); } catch (e) {
      if (terDono() === dono) terMensagem(alvoMsg, "Sem conexão com o servidor. Tente de novo.");
      return null;
    }
    const data = await res.json().catch(() => ({ sucesso: false, mensagem: "Resposta inválida do servidor." }));
    if (terDono() !== dono) return null;
    return data;
  } finally {
    terOcupado = false;
  }
}
function terMensagem(idEl, texto) { const el = terEl(idEl); if (el) el.textContent = texto || ""; }
const terGeral = () => !!(terCatalogos && terCatalogos.papeis && terCatalogos.papeis.geral);
const terChave = () => (terCatalogos && terCatalogos.mapa && terCatalogos.mapa.chave) || null;
const terIndicador = (codigo) => (terCatalogos && Array.isArray(terCatalogos.indicadores) ? terCatalogos.indicadores.find((i) => i.codigo === codigo) : null);
function terModo() {
  let m = null;
  try { m = window.localStorage.getItem(TER_MODO_CHAVE); } catch (e) { m = null; }
  return m === "google" && terChave() ? "google" : "lista";
}

// Troca de login ou saída: nada da sessão anterior fica na página.
function terLimparTela() {
  terCatalogos = null; terMapaDados = null; terBairrosLista = []; terCriteriosDados = null; terExtensoesLista = []; terForm = null;
  terPedidoSub++; terPedidoOpcoes++;
  terDesmontarMoldura();
  terSub = "mapa";
  for (const idEl of ["terResumo", "terDesenho", "terTabelaBairros", "terDensidade", "terFila", "terSimulacao", "terBairros", "terFormBairro", "terCriterios",
    "terFormCriterio", "terRaio", "terPontos", "terFormPonto", "terMsgMapa", "terMsgSimulacao", "terMsgBairros", "terMsgCriterios", "terMsgPontos"]) {
    const el = terEl(idEl); if (el) el.innerHTML = "";
  }
  terMarcarSub("mapa");
}

// ================================================================ abrir a pílula ================================================================
async function terAbrirAcao() {
  const meu = ++terPedidoOpcoes;
  if (!terCatalogos) {
    const cat = await terBuscar("catalogos");
    if (cat === null || meu !== terPedidoOpcoes) return;
    if (!cat.sucesso) { terEl("terResumo").innerHTML = cat.semConexao ? TER_SEM_CONEXAO : `<p class='subtitle'>${terH(cat.mensagem)}</p>`; terMarcarSub("mapa"); return; }
    terCatalogos = cat;
  }
  const b = terEl("btnTerSubBairros"); if (b) b.style.display = terGeral() ? "" : "none";
  const novo = terEl("btnTerNovoBairro"); if (novo) novo.style.display = terGeral() ? "" : "none";
  const novoC = terEl("btnTerNovoCriterio"); if (novoC) novoC.style.display = terGeral() ? "" : "none";
  const modo = terEl("terModo");
  if (modo) {
    const op = Array.from(modo.options).find((o) => o.value === "google");
    if (op) { op.disabled = !terChave(); op.textContent = terChave() ? "Mapa do Google" : "Mapa do Google (sem a chave configurada)"; }
    modo.value = terModo();
  }
  terMostrarSubAcao(terSubPermitida(terSub) ? terSub : "mapa");
}
const terSubPermitida = (s) => TER_SUBS.includes(s) && (s !== "bairros" || terGeral());
function terMarcarSub(sub) {
  terSub = terSubPermitida(sub) ? sub : "mapa";
  for (const s of TER_SUBS) {
    const div = terEl(`terSub${capitalize(s)}`); if (div) div.style.display = s === terSub ? "block" : "none";
    const b = terEl(`btnTerSub${capitalize(s)}`); if (b) { b.classList.toggle("ativo", s === terSub); b.setAttribute("aria-pressed", s === terSub ? "true" : "false"); }
  }
}
function terMostrarSubAcao(sub) {
  terDesmontarMoldura();
  terForm = null;
  for (const idEl of ["terFormBairro", "terFormCriterio", "terFormPonto"]) { const el = terEl(idEl); if (el) el.innerHTML = ""; }
  terMarcarSub(String(sub));
  if (!terCatalogos) return;
  if (terSub === "mapa") terCarregarMapaAcao();
  if (terSub === "simulacao") terCarregarSimulacaoAcao();
  if (terSub === "bairros") terCarregarBairrosAcao();
  if (terSub === "criterios") terCarregarCriteriosAcao();
  if (terSub === "pontos") terCarregarPontosAcao();
}

// ================================================================ a moldura do mapa do Google ================================================================
// A moldura tem sandbox SEM "allow-same-origin": a página do Google fica com uma origem opaca, sem acesso ao login, ao armazenamento nem à tela do sistema.
function terDesmontarMoldura() {
  if (terMoldura && terMoldura.el && terMoldura.el.parentNode) terMoldura.el.parentNode.removeChild(terMoldura.el);
  terMoldura = null;
}
function terMontarMoldura(alvoId, modo, extra) {
  terDesmontarMoldura();
  const alvo = terEl(alvoId);
  if (!alvo || !terChave()) return false;
  const f = document.createElement("iframe");
  f.setAttribute("sandbox", "allow-scripts allow-popups allow-popups-to-escape-sandbox");
  f.setAttribute("referrerpolicy", "strict-origin-when-cross-origin");
  f.setAttribute("title", modo === "marcar" ? "Mapa para marcar o ponto" : "Mapa territorial");
  f.className = "ter-moldura";
  f.src = "mapa-territorial.html";
  alvo.innerHTML = "";
  alvo.appendChild(f);
  terMoldura = { el: f, modo, enviado: false, ...extra };
  return true;
}
function terDadosParaMoldura() {
  const d = terMapaDados || {};
  return {
    bairros: (Array.isArray(d.bairros) ? d.bairros : []).filter((b) => b.lat != null && b.lng != null).map((b) => ({ nome: b.nome, lat: b.lat, lng: b.lng, membros: b.membros, descoberto: !!b.descoberto, distanciaKm: b.distanciaKm })),
    unidades: (Array.isArray(d.unidades) ? d.unidades : []).filter((u) => u.lat != null && u.lng != null).map((u) => ({ nome: u.nome, tipo: u.tipo, lat: u.lat, lng: u.lng })),
    raioKm: d.raioKm
  };
}
function terMensagemDaMoldura(ev) {
  if (!terMoldura || !terMoldura.el || ev.source !== terMoldura.el.contentWindow) return;
  const m = ev.data;
  if (!m || typeof m !== "object" || m.fonte !== "ieadespa-mapa") return;
  if (m.tipo === "pronto" && !terMoldura.enviado) {
    terMoldura.enviado = true;
    const base = terMoldura.modo === "marcar" ? { bairros: [], unidades: terDadosParaMoldura().unidades } : terDadosParaMoldura();
    terMoldura.el.contentWindow.postMessage({ fonte: "ieadespa-sistema", tipo: "desenhar", chave: terChave(), modo: terMoldura.modo, ...base, ponto: terMoldura.ponto || null }, "*");
    return;
  }
  if (m.tipo === "clique" && terMoldura.modo === "marcar") {
    const lat = Number(m.lat), lng = Number(m.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return;
    const a = terEl(terMoldura.alvoLat), o = terEl(terMoldura.alvoLng);
    if (a) a.value = lat.toFixed(6);
    if (o) o.value = lng.toFixed(6);
    return;
  }
  if (m.tipo === "erro") {
    const msg = m.motivo === "chave" ? "O Google recusou a chave do mapa (o endereço do sistema precisa estar autorizado nela). Use a lista e desenho, ou cole o link do Google Maps."
      : "O mapa do Google não abriu agora. Use a lista e desenho, ou cole o link do Google Maps.";
    terMensagem(terMoldura.modo === "marcar" ? terMoldura.alvoMsg : "terMsgMapa", msg);
    if (terMoldura.modo === "ver") { terDesmontarMoldura(); const g = terEl("terMolduraGoogle"); if (g) g.style.display = "none"; terDesenharLista(); }
  }
}
window.addEventListener("message", terMensagemDaMoldura);

// ================================================================ mapa de cobertura ================================================================
function terMudarModoAcao(valor) {
  const modo = valor === "google" && terChave() ? "google" : "lista";
  try { window.localStorage.setItem(TER_MODO_CHAVE, modo); } catch (e) { /* sem armazenamento: vale só agora */ }
  const sel = terEl("terModo"); if (sel) sel.value = modo;
  terDesenharMapa();
}
async function terCarregarMapaAcao() {
  const meu = ++terPedidoSub;
  const alvo = terEl("terResumo");
  if (!alvo) return;
  alvo.innerHTML = "<p class='subtitle'>Carregando…</p>";
  terMensagem("terMsgMapa", "");
  const d = await terBuscar("mapa");
  if (d === null || meu !== terPedidoSub) return;
  if (!d.sucesso) { alvo.innerHTML = d.semConexao ? TER_SEM_CONEXAO : `<p class='subtitle'>${terH(d.mensagem)}</p>`; return; }
  terMapaDados = d;
  terDesenharMapa();
}
function terDesenharMapa() {
  const d = terMapaDados;
  if (!d) return;
  const t = d.totais || {};
  terEl("terResumo").innerHTML = `<div class="ter-resumo">
    <p><strong>${terH(t.membros)}</strong> membro(s) ativo(s) ${d.escopo === "TODOS" ? "no campo" : "nas suas congregações"} · <strong>${terH(t.localizados)}</strong> com bairro marcado ·
      <strong>${terH(t.semLocalizacao)}</strong> sem localização${t.bairroEscritoNaFila ? ` (${terH(t.bairroEscritoNaFila)} com o bairro escrito, esperando o cadastro)` : ""}</p>
    <p><strong>${terH(t.descobertos)}</strong> bairro(s) descoberto(s) (com membros e nenhuma unidade a até ${terH(terKm(d.raioKm))}) ·
      ${terH(t.bairrosSemPonto)} bairro(s) com membros e sem ponto · ${terH(t.unidadesSemPonto)} unidade(s) sem ponto no mapa</p></div>`;
  const google = terModo() === "google";
  const moldura = terEl("terMolduraGoogle");
  if (google && moldura) {
    moldura.style.display = "";
    terMontarMoldura("terMolduraGoogle", "ver", {});
    terEl("terDesenho").innerHTML = "";
  } else {
    terDesmontarMoldura();
    if (moldura) moldura.style.display = "none";
    terDesenharLista();
  }
  terDesenharTabelas();
}

// O desenho simples (sem nada de fora): os pontos projetados num retângulo; o círculo do bairro cresce com os membros.
function terDesenharLista() {
  const d = terMapaDados || {};
  const bairros = (Array.isArray(d.bairros) ? d.bairros : []).filter((b) => b.lat != null && b.lng != null);
  const unidades = (Array.isArray(d.unidades) ? d.unidades : []).filter((u) => u.lat != null && u.lng != null);
  const alvo = terEl("terDesenho");
  if (!alvo) return;
  const pontos = [...bairros, ...unidades];
  if (!pontos.length) { alvo.innerHTML = "<p class='subtitle'>Ainda não há ponto marcado (bairros e unidades): o desenho aparece quando houver.</p>"; return; }
  const W = 640, H = 420, M = 30;
  const latMed = pontos.reduce((s, p) => s + p.lat, 0) / pontos.length;
  const fx = Math.cos((latMed * Math.PI) / 180) || 1;
  const xs = pontos.map((p) => p.lng * fx), ys = pontos.map((p) => p.lat);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const esc = Math.min((W - 2 * M) / Math.max(maxX - minX, 1e-6), (H - 2 * M) / Math.max(maxY - minY, 1e-6));
  const px = (p) => (M + (p.lng * fx - minX) * esc).toFixed(1);
  const py = (p) => (H - M - (p.lat - minY) * esc).toFixed(1);
  const maior = Math.max(1, ...bairros.map((b) => Number(b.membros) || 0));
  const circulos = bairros.map((b) => {
    const r = (4 + 22 * Math.sqrt((Number(b.membros) || 0) / maior)).toFixed(1);
    return `<g class="ter-bairro${b.descoberto ? " ter-descoberto" : ""}"><circle cx="${px(b)}" cy="${py(b)}" r="${r}"><title>${terH(b.nome)}: ${terH(b.membros)} membro(s)${b.descoberto ? " — descoberto" : ""}</title></circle>
      <text x="${px(b)}" y="${py(b)}" class="ter-num">${terH(b.membros)}</text></g>`;
  }).join("");
  const marcas = unidades.map((u) => {
    const x = Number(px(u)), y = Number(py(u));
    const forma = u.tipo === "EXTENSAO" ? `<polygon points="${x},${y - 7} ${x - 6},${y + 5} ${x + 6},${y + 5}" />` : `<rect x="${x - 5}" y="${y - 5}" width="10" height="10" />`;
    return `<g class="ter-unidade${u.tipo === "EXTENSAO" ? " ter-extensao" : ""}">${forma}<title>${u.tipo === "EXTENSAO" ? "Extensão" : "Congregação"}: ${terH(u.nome)}</title>
      <text x="${x + 8}" y="${y - 6}" class="ter-rotulo">${terH(u.nome)}</text></g>`;
  }).join("");
  alvo.innerHTML = `<svg class="ter-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="Desenho do território: bairros e unidades">${circulos}${marcas}</svg>
    <p class="subtitle">■ congregação · ▲ Extensão · ● bairro (o número é de membros; vermelho = descoberto). Desenho sem ruas, só para comparar as posições.</p>`;
}

function terDesenharTabelas() {
  const d = terMapaDados || {};
  const bairros = Array.isArray(d.bairros) ? d.bairros : [];
  const podePedir = typeof expLista === "function" && expLista("maes").length > 0;
  const linhas = bairros.map((b) => {
    const situacao = b.semPonto ? "sem ponto" : (b.descoberto ? "🔴 descoberto" : "coberto");
    const unidade = b.maisPerto ? `${terH(b.maisPerto.nome)}${b.maisPerto.tipo === "EXTENSAO" ? " (Extensão)" : ""}` : "—";
    const acao = b.descoberto && podePedir
      ? `<button type="button" class="btn-link" data-on-click="terAbrirPedidoAcao" data-args-click="${argsAttr("ABERTURA_EXTENSAO", null, b.nome, b.cidade, b.uf)}">Pedir Extensão aqui</button>` : "";
    return `<tr><td>${terH(b.nome)}${b.inativo ? " <small>(desativado)</small>" : ""}</td><td>${terH(b.cidade)}/${terH(b.uf)}</td><td>${terH(b.membros)}</td><td>${unidade}</td>
      <td>${terH(terKm(b.distanciaKm))}</td><td>${situacao}</td><td>${acao}</td></tr>`;
  }).join("");
  terEl("terTabelaBairros").innerHTML = `<h4>Por bairro</h4>${bairros.length ? `<div class="tabela-rolavel"><table class="tabela-simples"><thead><tr><th>Bairro</th><th>Cidade</th><th>Membros</th>
    <th>Unidade mais perto</th><th>Distância</th><th>Situação</th><th></th></tr></thead><tbody>${linhas}</tbody></table></div>`
    : "<p class='subtitle'>Nenhum bairro cadastrado ainda. O nível geral cadastra os bairros na sub-aba Bairros.</p>"}`;
  const dens = Array.isArray(d.densidade) ? d.densidade : [];
  terEl("terDensidade").innerHTML = `<h4>Por unidade</h4>${dens.length ? `<div class="tabela-rolavel"><table class="tabela-simples"><thead><tr><th>Unidade</th><th>Membros com bairro marcado</th>
    <th>Distância média até a unidade</th><th>Moram mais perto de outra unidade</th></tr></thead><tbody>${dens.map((u) => `<tr><td>${terH(u.nome)}${u.tipo === "EXTENSAO" ? " (Extensão)" : ""}</td>
    <td>${u.semPonto ? "<small>a unidade não tem ponto no mapa</small>" : terH(u.membrosLocalizados)}</td><td>${terH(terKm(u.distanciaMediaKm))}</td><td>${u.semPonto ? "—" : terH(u.maisPertoDeOutra)}</td></tr>`).join("")}
    </tbody></table></div>` : "<p class='subtitle'>Nenhuma unidade no seu alcance.</p>"}`;
  const fila = Array.isArray(d.fila) ? d.fila : [];
  terEl("terFila").innerHTML = terGeral() ? `<h4>Bairros escritos, esperando o cadastro</h4>${fila.length ? `<ul>${fila.map((f) => `<li>${terH(f.nome)} — ${terH(f.cidade)}/${terH(f.uf)}:
    ${terH(f.membros)} membro(s) <button type="button" class="btn-link" data-on-click="terNovoBairroAcao" data-args-click="${argsAttr(f.nome, f.cidade, f.uf)}">Cadastrar</button></li>`).join("")}</ul>`
    : "<p class='subtitle'>Nenhum.</p>"}` : "";
}

// O atalho para o pedido da v9.2 (aba Expansão → Pedidos), já com o tipo e o que der para preencher.
function terAbrirPedidoAcao(tipo, extensaoId, bairro, cidade, uf) {
  if (typeof expMostrarSecaoAcao !== "function") return;
  expMostrarSecaoAcao("pedidos");
  const det = document.getElementById("expNovoDetalhes"); if (det) det.open = true;
  const sel = document.getElementById("expNovoTipo");
  if (sel && Array.from(sel.options).some((o) => o.value === tipo)) { sel.value = tipo; if (typeof expTipoNovoAcao === "function") expTipoNovoAcao(); }
  if (tipo === "EMANCIPACAO") {
    const ext = document.getElementById("expNovoExtensao");
    if (ext && Array.from(ext.options).some((o) => o.value === String(extensaoId))) ext.value = String(extensaoId);
  }
  if (tipo === "ABERTURA_EXTENSAO") {
    const b = document.getElementById("expNovoBairro"); if (b && bairro) b.value = bairro;
    const c = document.getElementById("expNovoCidade"); if (c && cidade) c.value = cidade;
    const u = document.getElementById("expNovoUf"); if (u && uf && Array.from(u.options).some((o) => o.value === uf)) u.value = uf;
  }
  if (det && typeof det.scrollIntoView === "function") det.scrollIntoView({ block: "start" });
}

// ================================================================ simulação de emancipação ================================================================
function terRegra(c) {
  const ind = terIndicador(c.indicador);
  if (c.operador === "SIM") return "precisa ser sim";
  const valor = ind && ind.unidade === "reais" ? terReais(c.valor) : `${String(c.valor).replace(".", ",")}${ind && ind.unidade && ind.unidade !== "reais" ? ` ${ind.unidade}` : ""}`;
  return `${c.operador === "MINIMO" ? "pelo menos" : "no máximo"} ${valor}`;
}
function terMedido(indicador, v) {
  if (v == null) return "—";
  if (v === true) return "sim";
  if (v === false) return "não";
  const ind = terIndicador(indicador);
  if (ind && ind.unidade === "reais") return terReais(v);
  if (ind && ind.unidade === "km") return terKm(v);
  return String(v);
}
async function terCarregarSimulacaoAcao() {
  const meu = ++terPedidoSub;
  const alvo = terEl("terSimulacao");
  if (!alvo) return;
  alvo.innerHTML = "<p class='subtitle'>Carregando…</p>";
  const s = await terBuscar("simulacao");
  if (s === null || meu !== terPedidoSub) return;
  if (!s.sucesso) { alvo.innerHTML = s.semConexao ? TER_SEM_CONEXAO : `<p class='subtitle'>${terH(s.mensagem)}</p>`; return; }
  const crit = Array.isArray(s.criterios) ? s.criterios : [];
  const exts = Array.isArray(s.extensoes) ? s.extensoes : [];
  const cabeca = crit.length
    ? `<p class="subtitle">Critérios ativos: ${crit.map((c) => `${terH((terIndicador(c.indicador) || {}).rotulo || c.indicador)} — ${terH(terRegra(c))}`).join("; ")}.
       O dízimo conta de ${terH(s.janelaDizimo && s.janelaDizimo.de)} a ${terH(s.janelaDizimo && s.janelaDizimo.ate)}. A simulação só aponta: quem decide é a CME e a CLI.</p>`
    : "<p class='subtitle'>Nenhum critério ativo: a simulação não aponta nada. O nível geral monta a tabela na sub-aba Critérios.</p>";
  if (!exts.length) { alvo.innerHTML = `${cabeca}<p class='subtitle'>Nenhuma Extensão ativa no seu alcance.</p>`; return; }
  alvo.innerHTML = cabeca + exts.map((e) => {
    const a = e.avaliacao || {};
    const itens = Array.isArray(a.itens) ? a.itens : [];
    const botao = e.podePedir ? `<button type="button" class="btn-confirmar" style="width:auto;" data-on-click="terAbrirPedidoAcao" data-args-click="${argsAttr("EMANCIPACAO", Number(e.extensaoId), null, null, null)}">Pedir a emancipação</button>` : "";
    return `<div class="cartao-perfil ter-simulacao-item"><p class="linha-perfil"><strong>${terH(e.nome)}</strong> <small>(Extensão de ${terH(e.maeNome)})</small> —
      ${terH(TER_SITUACAO[a.situacao] || a.situacao)}${a.total ? ` (${terH(a.atendidos)} de ${terH(a.total)})` : ""}</p>
      ${itens.length ? `<div class="tabela-rolavel"><table class="tabela-simples"><thead><tr><th>Critério</th><th>Regra</th><th>Medido</th><th>Resultado</th></tr></thead><tbody>
      ${itens.map((i) => `<tr><td>${terH((terIndicador(i.indicador) || {}).rotulo || i.indicador)}</td><td>${terH(terRegra(i))}</td><td>${terH(terMedido(i.indicador, i.medido))}</td>
      <td>${terH(TER_RESULTADO[i.resultado] || i.resultado)}</td></tr>`).join("")}</tbody></table></div>` : ""}
      ${e.pedidoEmAndamento ? "<p class='subtitle'>Já há um pedido de emancipação desta Extensão em andamento.</p>" : ""}${botao}</div>`;
  }).join("");
}

// ================================================================ bairros (nível geral) ================================================================
async function terCarregarBairrosAcao() {
  const meu = ++terPedidoSub;
  const alvo = terEl("terBairros");
  if (!alvo) return;
  alvo.innerHTML = "<p class='subtitle'>Carregando…</p>";
  const r = await terBuscar("bairros");
  if (r === null || meu !== terPedidoSub) return;
  if (!r.sucesso) { alvo.innerHTML = r.semConexao ? TER_SEM_CONEXAO : `<p class='subtitle'>${terH(r.mensagem)}</p>`; return; }
  terBairrosLista = Array.isArray(r.bairros) ? r.bairros : [];
  alvo.innerHTML = terBairrosLista.length ? `<div class="tabela-rolavel"><table class="tabela-simples"><thead><tr><th>Bairro</th><th>Cidade</th><th>Ponto</th><th>Membros</th><th>Situação</th><th></th></tr></thead><tbody>
    ${terBairrosLista.map((b) => `<tr><td>${terH(b.nome)}</td><td>${terH(b.cidade)}/${terH(b.uf)}</td><td>${b.lat != null ? "marcado" : "<strong>sem ponto</strong>"}</td><td>${terH(b.membros)}</td>
      <td>${b.ativo ? "ativo" : "desativado"}</td><td>${b.ativo ? `<button type="button" class="btn-link" data-on-click="terEditarBairroAcao" data-args-click="${argsAttr(Number(b.bairroId))}">Editar</button>
      <button type="button" class="btn-link" data-on-click="terJuntarBairroAcao" data-args-click="${argsAttr(Number(b.bairroId))}">Juntar com outro</button>` : ""}
      <button type="button" class="btn-link" data-on-click="terAtivarBairroAcao" data-args-click="${argsAttr(Number(b.bairroId), !b.ativo)}">${b.ativo ? "Desativar" : "Reativar"}</button></td></tr>`).join("")}
    </tbody></table></div>` : "<p class='subtitle'>Nenhum bairro cadastrado. Use \"Novo bairro\".</p>";
}
// O bloco do ponto (latitude, longitude, colar o link e, com a chave, a moldura para clicar) — usado no bairro e na Extensão.
function terBlocoPonto(prefixo, ponto) {
  return `<div class="input-group"><label for="${prefixo}Lat">Latitude</label><input type="text" id="${prefixo}Lat" inputmode="decimal" maxlength="12" value="${terH(ponto && ponto.lat != null ? ponto.lat : "")}" /></div>
    <div class="input-group"><label for="${prefixo}Lng">Longitude</label><input type="text" id="${prefixo}Lng" inputmode="decimal" maxlength="12" value="${terH(ponto && ponto.lng != null ? ponto.lng : "")}" /></div>
    <div class="input-group"><label for="${prefixo}Link">Ou cole o link do Google Maps do lugar (ou "latitude, longitude")</label><input type="text" id="${prefixo}Link" maxlength="3000" />
      <button type="button" class="btn-confirmar btn-secundario" style="width:auto;" data-on-click="terLerLinkAcao" data-args-click="${argsAttr(prefixo)}">Usar o link</button></div>
    ${terChave() ? `<p class="subtitle">Ou clique no mapa abaixo:</p><div id="${prefixo}Moldura" class="ter-moldura-caixa"></div>` : ""}`;
}
// O link colado vira o ponto (a mesma leitura do servidor, aqui só para preencher os campos; o servidor confere de novo ao gravar).
function terLerLinkAcao(prefixo) {
  const entrada = terEl(`${prefixo}Link`);
  const t = entrada ? entrada.value.trim() : "";
  const msgId = prefixo === "terPonto" ? "terMsgPontos" : "terMsgBairros";
  let texto = t;
  try { texto = decodeURIComponent(t); } catch (e) { texto = t; }
  const num = "(-?[0-9]{1,3}(?:\\.[0-9]+)?)";
  const padroes = [new RegExp(`!3d${num}!4d${num}`), new RegExp(`@${num},${num}`), new RegExp(`[?&](?:q|query|ll|destination|center)=${num},\\s*${num}`), new RegExp(`^${num}\\s*[,;\\s]\\s*${num}$`)];
  for (const re of padroes) {
    const m = texto.match(re);
    if (m) {
      const lat = Number(m[1]), lng = Number(m[2]);
      if (Math.abs(lat) <= 90 && Math.abs(lng) <= 180 && !(lat === 0 && lng === 0)) {
        terEl(`${prefixo}Lat`).value = String(lat); terEl(`${prefixo}Lng`).value = String(lng);
        terMensagem(msgId, "Ponto lido do link. Confira e salve.");
        return;
      }
    }
  }
  terMensagem(msgId, /goo\.gl|maps\.app/i.test(texto) ? "O link curto não traz o ponto: abra-o no navegador e cole o endereço completo (o que tem @ e os números)."
    : "Não achei o ponto no que foi colado. Cole o link completo do Google Maps ou escreva \"latitude, longitude\".");
}
function terNovoBairroAcao(nome, cidade, uf) { terAbrirFormBairro(null, { nome: nome || "", cidade: cidade || "", uf: uf || "" }); }
function terEditarBairroAcao(bairroId) {
  const b = terBairrosLista.find((x) => x.bairroId === Number(bairroId));
  if (b) terAbrirFormBairro(b, b);
}
function terAbrirFormBairro(item, valores) {
  if (!terGeral()) return;
  if (terSub !== "bairros") terMarcarSub("bairros");
  if (!terBairrosLista.length) terCarregarBairrosAcao();
  terForm = { tipo: "bairro", item };
  const ufs = (terCatalogos && Array.isArray(terCatalogos.ufs) ? terCatalogos.ufs : []);
  terEl("terFormBairro").innerHTML = `<div class="vol-form"><h4>${item ? "Editar o bairro" : "Novo bairro"}</h4>
    <div class="input-group"><label for="terBairroNome">Nome do bairro (2 a 150)</label><input type="text" id="terBairroNome" maxlength="150" value="${terH(valores.nome)}" /></div>
    <div class="input-group"><label for="terBairroCidade">Cidade</label><input type="text" id="terBairroCidade" maxlength="150" value="${terH(valores.cidade || "Parauapebas")}" /></div>
    <div class="input-group"><label for="terBairroUf">UF</label><select id="terBairroUf">${ufs.map((u) => `<option value="${terH(u)}"${u === (valores.uf || "PA") ? " selected" : ""}>${terH(u)}</option>`).join("")}</select></div>
    ${terBlocoPonto("terBairro", item)}
    <p class="subtitle">Os membros que escreveram este mesmo nome de bairro (na mesma cidade) passam a ser deste bairro ao salvar.</p>
    <div class="barra-lista"><button type="button" class="btn-confirmar" style="width:auto;" data-on-click="terSalvarBairroAcao">💾 Salvar</button>
      <button type="button" class="btn-confirmar btn-secundario" style="width:auto;" data-on-click="terFecharFormAcao">Cancelar</button></div></div>`;
  if (terChave()) terMontarMoldura("terBairroMoldura", "marcar", { alvoLat: "terBairroLat", alvoLng: "terBairroLng", alvoMsg: "terMsgBairros", ponto: item && item.lat != null ? { lat: item.lat, lng: item.lng } : null });
}
function terFecharFormAcao() {
  terDesmontarMoldura();
  terForm = null;
  for (const idEl of ["terFormBairro", "terFormCriterio", "terFormPonto"]) { const el = terEl(idEl); if (el) el.innerHTML = ""; }
}
async function terSalvarBairroAcao() {
  if (!terForm || terForm.tipo !== "bairro") return;
  const item = terForm.item;
  const corpo = {
    nome: terEl("terBairroNome").value, cidade: terEl("terBairroCidade").value, uf: terEl("terBairroUf").value,
    lat: terEl("terBairroLat").value.trim() || null, lng: terEl("terBairroLng").value.trim() || null
  };
  if (item) { corpo.bairroId = item.bairroId; corpo.versao = item.versao; }
  const r = await terPost(item ? "bairro-editar" : "bairro", corpo, "terMsgBairros");
  if (!r) return;
  if (!r.sucesso) { terMensagem("terMsgBairros", r.mensagem); return; }
  terMensagem("terMsgBairros", r.membrosLigados ? `Bairro salvo. ${r.membrosLigados} membro(s) que tinham escrito este nome passaram a ser dele.` : "Bairro salvo.");
  terFecharFormAcao();
  terCatalogos = null;   // a lista dos bairros do catálogo mudou
  const cat = await terBuscar("catalogos"); if (cat && cat.sucesso) terCatalogos = cat;
  terCarregarBairrosAcao();
}
async function terAtivarBairroAcao(bairroId, ativo) {
  const b = terBairrosLista.find((x) => x.bairroId === Number(bairroId));
  if (!b) return;
  if (!ativo && !(await confirmarAcao(`Desativar o bairro ${b.nome}? Ele sai da lista para escolher (só é possível sem membros ativos ligados).`, "Desativar"))) return;
  const r = await terPost("bairro-ativo", { bairroId: b.bairroId, versao: b.versao, ativo: !!ativo }, "terMsgBairros");
  if (!r) return;
  terMensagem("terMsgBairros", r.sucesso ? (ativo ? "Bairro reativado." : "Bairro desativado.") : r.mensagem);
  if (r.sucesso) terCarregarBairrosAcao();
}
function terJuntarBairroAcao(bairroId) {
  const b = terBairrosLista.find((x) => x.bairroId === Number(bairroId));
  if (!b) return;
  terDesmontarMoldura();
  terForm = { tipo: "juntar", item: b };
  const outros = terBairrosLista.filter((x) => x.ativo && x.bairroId !== b.bairroId);
  terEl("terFormBairro").innerHTML = `<div class="vol-form"><h4>Juntar ${terH(b.nome)} (${terH(b.cidade)}/${terH(b.uf)}) com outro bairro</h4>
    <p class="subtitle">Use quando o mesmo bairro foi cadastrado duas vezes: os ${terH(b.membros)} membro(s) dele passam para o que fica, e este é desativado.</p>
    <div class="input-group"><label for="terJuntarDestino">O bairro que fica</label><select id="terJuntarDestino"><option value="">— escolha —</option>
      ${outros.map((x) => `<option value="${Number(x.bairroId)}">${terH(x.nome)} (${terH(x.cidade)}/${terH(x.uf)})</option>`).join("")}</select></div>
    <div class="barra-lista"><button type="button" class="btn-confirmar" style="width:auto;" data-on-click="terConfirmarJuntarAcao">Juntar</button>
      <button type="button" class="btn-confirmar btn-secundario" style="width:auto;" data-on-click="terFecharFormAcao">Cancelar</button></div></div>`;
}
async function terConfirmarJuntarAcao() {
  if (!terForm || terForm.tipo !== "juntar") return;
  const b = terForm.item;
  const destinoId = terEl("terJuntarDestino").value;
  if (!destinoId) { terMensagem("terMsgBairros", "Escolha o bairro que fica."); return; }
  const destino = terBairrosLista.find((x) => String(x.bairroId) === destinoId);
  if (!(await confirmarAcao(`Juntar ${b.nome} em ${destino ? destino.nome : "o bairro escolhido"}? Os membros de ${b.nome} passam para ele, e ${b.nome} é desativado.`, "Juntar"))) return;
  const r = await terPost("bairro-juntar", { bairroId: b.bairroId, versao: b.versao, destinoId }, "terMsgBairros");
  if (!r) return;
  terMensagem("terMsgBairros", r.sucesso ? `Bairros juntados: ${r.membrosMovidos} membro(s) mudaram de bairro.` : r.mensagem);
  if (r.sucesso) { terFecharFormAcao(); terCarregarBairrosAcao(); }
}

// ================================================================ critérios e raio ================================================================
async function terCarregarCriteriosAcao() {
  const meu = ++terPedidoSub;
  const alvo = terEl("terCriterios");
  if (!alvo) return;
  alvo.innerHTML = "<p class='subtitle'>Carregando…</p>";
  const r = await terBuscar("criterios");
  if (r === null || meu !== terPedidoSub) return;
  if (!r.sucesso) { alvo.innerHTML = r.semConexao ? TER_SEM_CONEXAO : `<p class='subtitle'>${terH(r.mensagem)}</p>`; return; }
  terCriteriosDados = r;
  const geral = terGeral();
  terEl("terRaio").innerHTML = geral
    ? `<div class="barra-lista"><label for="terRaioKm">Raio de cobertura (km): um bairro com membros e nenhuma unidade a até esta distância é "descoberto"</label>
       <input type="text" id="terRaioKm" inputmode="decimal" maxlength="6" value="${terH(String(r.raioKm).replace(".", ","))}" style="width:6em;" />
       <button type="button" class="btn-confirmar btn-secundario" style="width:auto;margin:0;" data-on-click="terSalvarRaioAcao">Salvar o raio</button></div>`
    : `<p class="subtitle">Raio de cobertura: ${terH(terKm(r.raioKm))} (o nível geral muda).</p>`;
  const lista = Array.isArray(r.criterios) ? r.criterios : [];
  alvo.innerHTML = lista.length ? `<div class="tabela-rolavel"><table class="tabela-simples"><thead><tr><th>Ordem</th><th>Indicador</th><th>Regra</th><th>Ativo</th><th>Observação</th>${geral ? "<th></th>" : ""}</tr></thead><tbody>
    ${lista.map((c) => `<tr><td>${terH(c.ordem)}</td><td>${terH((terIndicador(c.indicador) || {}).rotulo || c.indicador)}</td><td>${terH(terRegra(c))}</td><td>${c.ativo ? "sim" : "não"}</td>
      <td>${terH(c.observacao || "")}</td>${geral ? `<td><button type="button" class="btn-link" data-on-click="terEditarCriterioAcao" data-args-click="${argsAttr(Number(c.criterioId))}">Editar</button>
      <button type="button" class="btn-link" data-on-click="terApagarCriterioAcao" data-args-click="${argsAttr(Number(c.criterioId))}">Apagar</button></td>` : ""}</tr>`).join("")}
    </tbody></table></div>` : "<p class='subtitle'>A tabela está vazia: a simulação não aponta nada até haver um critério ativo.</p>";
}
async function terSalvarRaioAcao() {
  if (!terCriteriosDados) return;
  const r = await terPost("raio", { raioKm: terEl("terRaioKm").value.trim(), versao: terCriteriosDados.versaoParametros }, "terMsgCriterios");
  if (!r) return;
  terMensagem("terMsgCriterios", r.sucesso ? "Raio salvo." : r.mensagem);
  if (r.sucesso) { terMapaDados = null; terCarregarCriteriosAcao(); }
}
function terNovoCriterioAcao() { terAbrirFormCriterio(null); }
function terEditarCriterioAcao(criterioId) {
  const c = terCriteriosDados && Array.isArray(terCriteriosDados.criterios) ? terCriteriosDados.criterios.find((x) => x.criterioId === Number(criterioId)) : null;
  if (c) terAbrirFormCriterio(c);
}
function terAbrirFormCriterio(item) {
  if (!terGeral()) return;
  if (terSub !== "criterios") { terMarcarSub("criterios"); terCarregarCriteriosAcao(); }
  terForm = { tipo: "criterio", item };
  const inds = terCatalogos && Array.isArray(terCatalogos.indicadores) ? terCatalogos.indicadores : [];
  terEl("terFormCriterio").innerHTML = `<div class="vol-form"><h4>${item ? "Editar o critério" : "Novo critério"}</h4>
    <div class="input-group"><label for="terCritIndicador">Indicador</label><select id="terCritIndicador" data-on-change="terCriterioIndicadorAcao">
      ${inds.map((i) => `<option value="${terH(i.codigo)}"${item && item.indicador === i.codigo ? " selected" : ""}>${terH(i.rotulo)}</option>`).join("")}</select></div>
    <div class="input-group"><label for="terCritOperador">Comparação</label><select id="terCritOperador"></select></div>
    <div class="input-group" id="terCritValorGrupo"><label for="terCritValor">Valor</label><input type="text" id="terCritValor" inputmode="decimal" maxlength="14" value="${terH(item && item.valor != null ? String(item.valor).replace(".", ",") : "")}" /></div>
    <div class="input-group"><label for="terCritOrdem">Ordem (0 a 999: a posição na lista)</label><input type="text" id="terCritOrdem" inputmode="numeric" maxlength="3" value="${terH(item ? item.ordem : "")}" /></div>
    <div class="input-group"><label for="terCritObs">Observação (opcional, até 300)</label><input type="text" id="terCritObs" maxlength="300" value="${terH(item && item.observacao ? item.observacao : "")}" /></div>
    <label><input type="checkbox" id="terCritAtivo"${!item || item.ativo ? " checked" : ""} /> ativo (conta na simulação)</label>
    <div class="barra-lista"><button type="button" class="btn-confirmar" style="width:auto;" data-on-click="terSalvarCriterioAcao">💾 Salvar</button>
      <button type="button" class="btn-confirmar btn-secundario" style="width:auto;" data-on-click="terFecharFormAcao">Cancelar</button></div></div>`;
  terCriterioIndicadorAcao(item ? item.operador : null);
}
// O indicador de sim/não só aceita "precisa ser sim" (sem valor); os de número, "pelo menos" ou "no máximo".
function terCriterioIndicadorAcao(operadorAtual) {
  const sel = terEl("terCritIndicador"), op = terEl("terCritOperador");
  if (!sel || !op) return;
  const ind = terIndicador(sel.value);
  const simnao = ind && ind.tipo === "simnao";
  const opcoes = simnao ? [["SIM", "precisa ser sim"]] : [["MINIMO", "pelo menos"], ["MAXIMO", "no máximo"]];
  const antes = typeof operadorAtual === "string" ? operadorAtual : op.value;
  op.innerHTML = opcoes.map(([v, r]) => `<option value="${escaparHtmlEbd(v)}">${escaparHtmlEbd(r)}</option>`).join("");
  if (opcoes.some(([v]) => v === antes)) op.value = antes;
  const grupo = terEl("terCritValorGrupo"); if (grupo) grupo.style.display = simnao ? "none" : "";
  const rot = grupo ? grupo.querySelector("label") : null;
  if (rot) rot.textContent = ind && ind.unidade ? `Valor (${ind.unidade}${ind.inteiro ? ", número inteiro" : ""}${ind.maximo != null ? `, até ${ind.maximo}` : ""})` : "Valor";
}
async function terSalvarCriterioAcao() {
  if (!terForm || terForm.tipo !== "criterio") return;
  const item = terForm.item;
  const corpo = {
    indicador: terEl("terCritIndicador").value, operador: terEl("terCritOperador").value, valor: terEl("terCritValor").value.trim() || null,
    ordem: terEl("terCritOrdem").value.trim() || null, observacao: terEl("terCritObs").value, ativo: !!terEl("terCritAtivo").checked
  };
  if (item) { corpo.criterioId = item.criterioId; corpo.versao = item.versao; }
  const r = await terPost(item ? "criterio-editar" : "criterio", corpo, "terMsgCriterios");
  if (!r) return;
  terMensagem("terMsgCriterios", r.sucesso ? "Critério salvo." : r.mensagem);
  if (r.sucesso) { terFecharFormAcao(); terCarregarCriteriosAcao(); }
}
async function terApagarCriterioAcao(criterioId) {
  const c = terCriteriosDados && Array.isArray(terCriteriosDados.criterios) ? terCriteriosDados.criterios.find((x) => x.criterioId === Number(criterioId)) : null;
  if (!c) return;
  const rotulo = (terIndicador(c.indicador) || {}).rotulo || c.indicador;
  if (!(await confirmarAcao(`Apagar o critério "${rotulo} — ${terRegra(c)}"? (Para só deixar de contar, edite e desmarque "ativo".)`, "Apagar"))) return;
  const r = await terPost("criterio-apagar", { criterioId: c.criterioId, versao: c.versao }, "terMsgCriterios");
  if (!r) return;
  terMensagem("terMsgCriterios", r.sucesso ? "Critério apagado." : r.mensagem);
  if (r.sucesso) terCarregarCriteriosAcao();
}

// ================================================================ pontos das Extensões ================================================================
async function terCarregarPontosAcao() {
  const meu = ++terPedidoSub;
  const alvo = terEl("terPontos");
  if (!alvo) return;
  alvo.innerHTML = "<p class='subtitle'>Carregando…</p>";
  const r = await terBuscar("extensoes");
  if (r === null || meu !== terPedidoSub) return;
  if (!r.sucesso) { alvo.innerHTML = r.semConexao ? TER_SEM_CONEXAO : `<p class='subtitle'>${terH(r.mensagem)}</p>`; return; }
  terExtensoesLista = Array.isArray(r.extensoes) ? r.extensoes : [];
  alvo.innerHTML = terExtensoesLista.length ? `<div class="tabela-rolavel"><table class="tabela-simples"><thead><tr><th>Extensão</th><th>Congregação-Mãe</th><th>Endereço</th><th>Ponto</th><th></th></tr></thead><tbody>
    ${terExtensoesLista.map((e) => `<tr><td>${terH(e.nome)}</td><td>${terH(e.maeNome)}</td><td>${terH(e.endereco || "—")}</td><td>${e.lat != null ? "marcado" : "<strong>sem ponto</strong>"}</td>
      <td>${e.podeMarcar ? `<button type="button" class="btn-link" data-on-click="terMarcarPontoAcao" data-args-click="${argsAttr(Number(e.extensaoId))}">${e.lat != null ? "Mudar o ponto" : "Marcar o ponto"}</button>` : ""}</td></tr>`).join("")}
    </tbody></table></div>` : "<p class='subtitle'>Nenhuma Extensão ativa no seu alcance.</p>";
}
function terMarcarPontoAcao(extensaoId) {
  const e = terExtensoesLista.find((x) => x.extensaoId === Number(extensaoId));
  if (!e || !e.podeMarcar) return;
  terForm = { tipo: "ponto", item: e };
  terEl("terFormPonto").innerHTML = `<div class="vol-form"><h4>O ponto da Extensão ${terH(e.nome)}</h4>
    ${e.endereco ? `<p class="subtitle">Endereço cadastrado: ${terH(e.endereco)}</p>` : ""}
    ${terBlocoPonto("terPonto", e)}
    <div class="barra-lista"><button type="button" class="btn-confirmar" style="width:auto;" data-on-click="terSalvarPontoAcao">💾 Salvar o ponto</button>
      ${e.lat != null ? `<button type="button" class="btn-confirmar btn-secundario" style="width:auto;" data-on-click="terApagarPontoAcao">Apagar o ponto</button>` : ""}
      <button type="button" class="btn-confirmar btn-secundario" style="width:auto;" data-on-click="terFecharFormAcao">Cancelar</button></div></div>`;
  if (terChave()) terMontarMoldura("terPontoMoldura", "marcar", { alvoLat: "terPontoLat", alvoLng: "terPontoLng", alvoMsg: "terMsgPontos", ponto: e.lat != null ? { lat: e.lat, lng: e.lng } : null });
}
async function terGravarPonto(lat, lng) {
  if (!terForm || terForm.tipo !== "ponto") return;
  const r = await terPost("ponto-extensao", { extensaoId: terForm.item.extensaoId, lat, lng }, "terMsgPontos");
  if (!r) return;
  terMensagem("terMsgPontos", r.sucesso ? (lat == null ? "Ponto apagado." : "Ponto salvo.") : r.mensagem);
  if (r.sucesso) { terFecharFormAcao(); terMapaDados = null; terCarregarPontosAcao(); }
}
function terSalvarPontoAcao() { terGravarPonto(terEl("terPontoLat").value.trim() || null, terEl("terPontoLng").value.trim() || null); }
async function terApagarPontoAcao() {
  if (!terForm || terForm.tipo !== "ponto") return;
  if (!(await confirmarAcao(`Apagar o ponto da Extensão ${terForm.item.nome}? Ela deixa de aparecer no mapa até ser marcada de novo.`, "Apagar"))) return;
  terGravarPonto(null, null);
}

// ================================================================ Meus Dados ================================================================
// O endereço em linhas e os atos da pessoa no território (LGPD Art. 18). Sem nada, o cartão não aparece.
function terCartaoMeusDados(t) {
  if (!t || typeof t !== "object") return "";
  const e = t.endereco || {};
  const a = t.atos || {};
  const linhas = [e.logradouro, e.numero, e.complemento].filter(Boolean).join(", ");
  const bairro = e.bairroNome || e.bairroTexto;
  const temEndereco = linhas || bairro || e.cidade || e.cep;
  const lista = (x) => (Array.isArray(x) ? x : []);
  const atos = [
    ...lista(a.bairros).map((b) => `Bairro ${terH(b.bairro)}${b.cadastrou ? " — cadastrado por você" : ""}${b.ultimaMudancaEm ? " — mudado por você por último" : ""}`),
    ...lista(a.criterios).map((c) => `Critério "${terH(c.indicador)}"${c.criou ? " — criado por você" : ""}${c.ultimaMudancaEm ? " — mudado por você por último" : ""}`),
    ...lista(a.pontosDeExtensao).map((p) => `Ponto da Extensão ${terH(p.extensao)} — marcado por você`),
    ...lista(a.raioDeCobertura).map(() => "Raio de cobertura — mudado por você por último")
  ];
  if (!temEndereco && !atos.length) return "";
  return `<div class="cartao-perfil"><p class="linha-perfil"><strong>🗺️ Endereço e território</strong></p>
    ${temEndereco ? `<p class="linha-perfil">${terH(linhas || "—")}${bairro ? ` — bairro ${terH(bairro)}${e.bairroTexto ? " (escrito; esperando o cadastro do bairro)" : ""}` : ""}${e.cidade ? ` — ${terH(e.cidade)}${e.uf ? `/${terH(e.uf)}` : ""}` : ""}${e.cep ? ` — CEP ${terH(e.cep)}` : ""}</p>
      <p class="linha-perfil"><small>No mapa territorial você entra só na contagem do seu bairro, nunca pelo nome.</small></p>` : ""}
    ${atos.map((x) => `<p class="linha-perfil">${x}</p>`).join("")}</div>`;
}

registrarAcoes({
  terMostrarSubAcao, terMudarModoAcao, terCarregarMapaAcao, terAbrirPedidoAcao, terCarregarSimulacaoAcao, terCarregarBairrosAcao, terNovoBairroAcao, terEditarBairroAcao,
  terFecharFormAcao, terSalvarBairroAcao, terAtivarBairroAcao, terJuntarBairroAcao, terConfirmarJuntarAcao, terLerLinkAcao, terCarregarCriteriosAcao, terSalvarRaioAcao,
  terNovoCriterioAcao, terEditarCriterioAcao, terCriterioIndicadorAcao, terSalvarCriterioAcao, terApagarCriterioAcao, terCarregarPontosAcao, terMarcarPontoAcao,
  terSalvarPontoAcao, terApagarPontoAcao
});
