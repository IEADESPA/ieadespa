// modulos/casca.js — FASE 10, a CASCA NOVA aprovada pelo responsável (rodadas 2 a 7 e 12; docs/plano/fase-10-experiencia-design-performance.md):
// o modo claro/escuro escolhido no topo (e lembrado neste aparelho; sem escolha, segue o aparelho), a entrada como primeira tela (quem já tem
// sessão vai direto para o Início) e, no celular, o menu em ABAS EM PÍLULAS no alto (Início, Trabalho, Minha vida, Avisos — o membro sem
// "Trabalho"), com nada preso embaixo. Mesmo escopo global dos outros módulos (vD.2); os botões passam pelo registrarAcoes.
// Conformidade (18/11/2026, depois da reprovação): os ÍCONES DE TRAÇO do desenho no lugar dos emojis, o MENU PRINCIPAL LIMPO (Início, Meu
// trabalho, Minha vida na igreja, Meu Perfil e a pessoa no pé), o INÍCIO com as 2 pendências de cada módulo, o CAMINHO na barra do topo, o
// menu RECOLHÍVEL lembrado no aparelho, MEU TRABALHO, MINHA VIDA e MEU PERFIL como no desenho.

// ---- os ÍCONES DE TRAÇO (os mesmos da página de propostas: viewBox 24, traço redondo, sem preenchimento; a cor vem do texto em volta) ----
const ICONES_CASCA = {
  casa: "M3 11l9-7 9 7M5 10v10h14V10",
  pasta: "M3 7h6l2 2h10v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z",
  pessoa: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21c1.5-4 4.5-6 8-6s6.5 2 8 6",
  pessoas: "M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM2 20c1-3.5 3.8-5.5 7-5.5s6 2 7 5.5M16 4.5a3.5 3.5 0 0 1 0 6.5M18 14.8c2 .7 3.4 2.4 4 5.2",
  dinheiro: "M3 6h18v12H3zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM6.5 9h.01M17.5 15h.01",
  livro: "M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2zM4 19V5M8 7h7",
  calendario: "M4 6h16v14H4zM4 10h16M8 3v4M16 3v4",
  escudo: "M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z",
  megafone: "M3 10v4h4l6 4V6l-6 4zM17 9a4 4 0 0 1 0 6",
  coracao: "M12 20s-7-4.5-7-10a4 4 0 0 1 7-2.5A4 4 0 0 1 19 10c0 5.5-7 10-7 10z",
  globo: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM3 12h18M12 3c2.5 2.5 3.5 5.5 3.5 9s-1 6.5-3.5 9c-2.5-2.5-3.5-5.5-3.5-9s1-6.5 3.5-9z",
  mapa: "M9 4L3 6v14l6-2 6 2 6-2V4l-6 2zM9 4v14M15 6v14",
  sino: "M6 16v-5a6 6 0 1 1 12 0v5l2 2H4zM10 20a2 2 0 0 0 4 0",
  busca: "M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM20 20l-4-4",
  seta: "M9 6l6 6-6 6",
  setaBaixo: "M6 9l6 6 6-6",
  voltar: "M15 6l-6 6 6 6",
  check: "M5 12l5 5 9-10",
  cartao: "M3 6h18v12H3zM7 10h4M7 14h6M15 10h3",
  balanca: "M12 3v18M6 21h12M6 7h12M6 7l-3 6a3 3 0 0 0 6 0zM18 7l-3 6a3 3 0 0 0 6 0z",
  lua: "M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z",
  sol: "M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10zM12 1v2M12 21v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M1 12h2M21 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4",
  planilha: "M4 4h16v16H4zM4 10h16M4 15h16M10 4v16",
  mais: "M12 5v14M5 12h14",
  grafico: "M4 20V11M10 20V5M16 20v-7M21 20H3",
  doc: "M6 3h9l4 4v14H6zM14 3v5h5M9 13h6M9 17h6",
  relogio: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2",
  maleta: "M4 8h16v12H4zM9 8V5h6v3M4 13h16",
  igreja: "M12 2v4M10 4h4M12 6l6 5v10H6V11zM10 21v-5h4v5",
  filtro: "M3 5h18l-7 8v6l-4-2v-4z",
  menu: "M4 6h16M4 12h16M4 18h16",
  fechar: "M6 6l12 12M18 6L6 18",
  ajudaQ: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6V14M12 17.5v.01",
  alerta: "M12 3l10 18H2zM12 10v5M12 18v.01",
  cadeado: "M6 11h12v10H6zM8 11V8a4 4 0 0 1 8 0v3",
  celular: "M8 2h8a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1zM11 18h2",
  chave: "M15.5 12a4.5 4.5 0 1 0-4.2-2.9L3 17.4V21h3.6v-2.4H9v-2.4h2.4l1.9-1.9a4.5 4.5 0 0 0 2.2.7z",
  engrenagem: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z",
  lapis: "M4 20h4L19 9l-4-4L4 16zM13 7l4 4",
  notebook: "M4 5h16v10H4zM2 19h20",
  qr: "M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h2v2h-2zM18 14h2v2h-2zM14 18h2v2h-2zM18 18h2v2h-2z",
  // os do sistema que o desenho não tinha, no mesmo traço
  tarefa: "M4 4h16v16H4zM8 12l3 3 5-6",
  envelope: "M3 6h18v12H3zM3 7l9 7 9-7",
  alvo: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10zM12 13a1 1 0 1 0 0-2 1 1 0 0 0 0 2z",
  saida: "M3 7h13v10H3zM9.5 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM18 12h4M20 10l2 2-2 2",
  tendencia: "M3 17l6-6 4 4 8-8M15 7h6v6",
  queda: "M3 7l6 6 4-4 8 8M15 17h6v-6",
  banco: "M3 10l9-6 9 6M5 10v8M9.5 10v8M14.5 10v8M19 10v8M3 20h18",
  casas: "M3 21V11l6-5 6 5v10M9 21v-5M15 9l3-3 3 3v12h-6",
  obra: "M3 21h18M6 21V10h12v11M9 10V6h6v4M10 14h4",
  carro: "M5 17h14M5 17v-4l2-5h10l2 5v4M5 17v2M19 17v2M7 13h10",
  recibo: "M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6M9 12h6M9 16h4",
  impressora: "M7 8V3h10v5M5 8h14a2 2 0 0 1 2 2v6h-4v4H7v-4H3v-6a2 2 0 0 1 2-2zM9 15h6",
  diamante: "M6 3h12l4 6-10 12L2 9zM2 9h20M9 3l3 6 3-6",
  bussola: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM15.5 8.5l-2 5-5 2 2-5z",
  formatura: "M2 9l10-5 10 5-10 5zM6 11v5c3 2 9 2 12 0v-5M22 9v6",
  trofeu: "M8 4h8v5a4 4 0 0 1-8 0zM8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4M12 13v4M9 21h6M10 17h4",
  paleta: "M12 21a9 9 0 1 1 9-9c0 2.5-2 3-3.5 3H16a2 2 0 0 0-1.5 3.3A2 2 0 0 1 12 21zM7.5 11h.01M10 7.5h.01M14.5 7.5h.01",
  tenda: "M3 20L12 4l9 16zM12 4v16M8.5 20l3.5-6 3.5 6",
  broto: "M12 21v-8M12 13c0-4 3-6 7-6 0 4-3 6-7 6zM12 15c0-3-2-5-6-5 0 3 2 5 6 5z",
  crianca: "M12 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM8 21v-6l-2-3 3-1.5h6L18 12l-2 3v6M12 21v-4",
  estetoscopio: "M6 3v6a4 4 0 0 0 8 0V3M10 13v3a4 4 0 0 0 8 0v-2M18 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4z",
  maos: "M12 20s-6-3.6-6-8a3 3 0 0 1 6-1 3 3 0 0 1 6 1c0 4.4-6 8-6 8zM3 14l3 2M21 14l-3 2",
  pomba: "M4 14c4 0 6-2 8-6 1 3 4 5 8 5-2 3-5 5-9 5-3 0-5-1-7-4zM12 8c0-2 1-4 3-5",
  urna: "M4 13h16v8H4zM8 13V5h8v8M10 9l1.5 1.5L14 8",
  hospital: "M4 21V7h16v14M9 21v-4h6v4M12 10v4M10 12h4M8 7V3h8v4",
  prancheta: "M8 4h8v3H8zM6 5H5v16h14V5h-1M9 12h6M9 16h4",
  bandeja: "M3 13l3-8h12l3 8v6H3zM3 13h5l1 2h6l1-2h5",
  transferir: "M4 8h13M13 4l4 4-4 4M20 16H7M11 12l-4 4 4 4"
};
// o desenho do ícone (texto fixo: o nome vem de lista fechada; nome desconhecido não desenha nada)
function iconeSvg(nome, tam) {
  const d = Object.prototype.hasOwnProperty.call(ICONES_CASCA, nome) ? ICONES_CASCA[nome] : "";
  if (!d) return "";
  const t = Number(tam) || 20;
  return `<svg width="${t}" height="${t}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="${d}"/></svg>`;
}
// pinta os <span data-icone="..."> ainda vazios (o menu, o topo e o que os módulos montarem depois)
function pintarIcones(raiz) {
  (raiz || document).querySelectorAll("[data-icone]").forEach((el) => {
    if (el.dataset.iconePintado === el.dataset.icone) return;
    el.innerHTML = iconeSvg(el.dataset.icone, el.dataset.iconeTam);
    el.dataset.iconePintado = el.dataset.icone;
  });
}
let pintarIconesEspera = null;
function vigiarIcones() {
  if (typeof MutationObserver !== "function") return;
  new MutationObserver(() => {
    if (pintarIconesEspera) return;
    pintarIconesEspera = setTimeout(() => { pintarIconesEspera = null; pintarIcones(document); }, 30);
  }).observe(document.body, { childList: true, subtree: true });
}
const tileCasca = (cor, icone, tam) => `<span class="tile-casca" data-cor="${escaparHtmlEbd(String(cor || ""))}" aria-hidden="true">${iconeSvg(icone, tam || 20)}</span>`;

// ---- o modo claro/escuro ----
const CHAVE_TEMA = "ieadespaTema";
function temaEscolhido() {
  let salvo = null;
  try { salvo = localStorage.getItem(CHAVE_TEMA); } catch (e) { /* sem armazenamento: segue o aparelho */ }
  return salvo === "claro" || salvo === "escuro" ? salvo : null;
}
function temaDoAparelho() {
  try { return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "escuro" : "claro"; } catch (e) { return "claro"; }
}
function aplicarTema(tema) {
  const final = tema === "escuro" ? "escuro" : "claro";
  document.documentElement.dataset.tema = final;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", final === "escuro" ? "#061629" : "#0A2342");
  const btn = document.getElementById("btnTema");
  if (btn) {
    btn.innerHTML = iconeSvg(final === "escuro" ? "sol" : "lua", 20);
    btn.setAttribute("aria-label", final === "escuro" ? "Trocar para o modo claro" : "Trocar para o modo escuro");
    btn.setAttribute("title", final === "escuro" ? "Modo claro" : "Modo escuro");
  }
}
function alternarTemaAcao() {
  const novo = document.documentElement.dataset.tema === "escuro" ? "claro" : "escuro";
  try { localStorage.setItem(CHAVE_TEMA, novo); } catch (e) { /* vale só nesta visita */ }
  aplicarTema(novo);
}
aplicarTema(temaEscolhido() || temaDoAparelho());
try {
  // sem escolha salva, acompanha o aparelho quando ele troca (ex.: o celular escurece à noite)
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => { if (!temaEscolhido()) aplicarTema(temaDoAparelho()); });
} catch (e) { /* navegador antigo: fica no tema de agora */ }

// ---- ETAPA 2: as LETRAS servidas de dentro (app/fontes) e o seletor TEMPORÁRIO "Fonte (teste)", só fora da produção, para o responsável
// escolher vendo o sistema de verdade (a escolha fica neste aparelho). Na produção vale sempre a fonte padrão do style.css. ----
const CHAVE_FONTE_TESTE = "ieadespaFonteTeste";
const FONTES_TESTE = [["inter", "Inter (a de hoje)"], ["atkinson", "Atkinson Hyperlegible"], ["source", "Source Sans 3"], ["jakarta", "Plus Jakarta Sans"]];
function ehProducaoCasca() { return location.hostname === "app.ieadespa.org.br"; }
function aplicarFonteTeste() {
  let k = null;
  if (!ehProducaoCasca()) { try { k = localStorage.getItem(CHAVE_FONTE_TESTE); } catch (e) { /* sem armazenamento */ } }
  if (k && FONTES_TESTE.some((x) => x[0] === k) && k !== "inter") document.documentElement.dataset.fonte = k;
  else delete document.documentElement.dataset.fonte;
}
function escolherFonteTesteAcao(k) {
  try { localStorage.setItem(CHAVE_FONTE_TESTE, String(k)); } catch (e) { /* vale só nesta visita */ }
  aplicarFonteTeste();
  desenharMeuPerfilCasca(true);
}
aplicarFonteTeste();
// a troca de tela DESLIZANDO (view transitions): o conteúdo entra da direita e o menu troca de cor no esmaecer dele; sem suporte ou com
// "movimento reduzido" ligado no aparelho, a troca é direta
function comTransicaoCasca(fn) {
  let reduz = false;
  try { reduz = window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch (e) { /* segue */ }
  if (!reduz && typeof document.startViewTransition === "function") { document.startViewTransition(() => { fn(); }); return; }
  fn();
}
function entrarModuloCasca(chave) { comTransicaoCasca(() => entrarModulo(chave)); }

// ---- o menu RECOLHÍVEL (rodada 9: "em todas as telas, como no celular"): o ☰ do alto do menu, lembrado neste aparelho ----
const CHAVE_MENU_RECOLHIDO = "ieadespaMenuRecolhido";
function alternarMenuRecolhidoCasca() {
  const sb = document.getElementById("sidebar");
  if (!sb) return;
  const recolher = !sb.classList.contains("recolhido");
  sb.classList.toggle("recolhido", recolher);
  try { localStorage.setItem(CHAVE_MENU_RECOLHIDO, recolher ? "1" : "0"); } catch (e) { /* vale só nesta visita */ }
}

// ---- a entrada: a primeira tela é "entrar no sistema"; com sessão aberta, vai direto para o Início ----
document.addEventListener("DOMContentLoaded", () => {
  aplicarTema(document.documentElement.dataset.tema);
  pintarIcones(document);
  vigiarIcones();
  try { if (localStorage.getItem(CHAVE_MENU_RECOLHIDO) === "1" && window.innerWidth > 640) document.getElementById("sidebar").classList.add("recolhido"); } catch (e) { /* sem armazenamento */ }
  prepararGruposDoMenu();
  const entrada = document.getElementById("telaPainel");
  const login = document.getElementById("cxLoginPainel");
  if (entrada && login && entrada.style.display !== "none" && login.style.display !== "none" && typeof authToken !== "undefined" && authToken && authMatricula) {
    mostrarTelaPainelInicial();
  }
  atualizarPilulasCelular();
  // o número do sino aparece também na pílula "Avisos"
  const badge = document.getElementById("badgeSino");
  if (badge && typeof MutationObserver === "function") new MutationObserver(atualizarPilulasCelular).observe(badge, { childList: true, characterData: true, subtree: true, attributes: true });
  // o caminho do topo acompanha o título de cada tela (todas as trocas de aba e subaba escrevem nele)
  const titulo = document.getElementById("tituloModulo");
  if (titulo && typeof MutationObserver === "function") new MutationObserver(() => setTimeout(atualizarTrilhaCasca, 0)).observe(titulo, { childList: true, characterData: true, subtree: true });
});

// ---- o MENU PRINCIPAL LIMPO (rodadas 3, 4 e 7): Início, Meu trabalho, Minha vida na igreja e Meu Perfil ----
// as telas antigas do Meu Painel e a que parte do menu cada uma pertence (para marcar o item certo e montar o caminho do topo)
const SUBS_VIDA_CASCA = ["minhavida", "credencial", "agenda", "minhasescalas", "votacoes", "eventos", "contribuicoes", "cuidado", "comunicacoes", "cartas", "minhaformacao",
  "minhasconquistas", "identidade", "canais", "frequencia", "minhahabilitacao", "menores", "protecao", "checkininfantil", "setores"];
const SUBS_PERFIL_CASCA = ["meuperfil", "dados", "vinculos", "seguranca", "lgpd"];
const SUBS_TRABALHO_CASCA = ["trabalho", "tarefas"];
function parteDoMenuAgora() {
  if (typeof moduloAtual !== "undefined" && moduloAtual) return "trabalho";
  const sub = typeof subAbaMeupainelAtual !== "undefined" ? subAbaMeupainelAtual : "perfil";
  if (SUBS_TRABALHO_CASCA.includes(sub)) return "trabalho";
  if (SUBS_PERFIL_CASCA.includes(sub)) return "perfil";
  if (SUBS_VIDA_CASCA.includes(sub)) return "vida";
  return "inicio";
}
// os módulos do TRABALHO da pessoa: os que ela tem por PERMISSÃO. As abas abertas a todos (Documentos, Ouvidoria) não fazem do membro um obreiro:
// elas abrem por "Minha vida na igreja".
function modulosDeTrabalhoCasca() {
  if (typeof MODULOS === "undefined" || typeof temPermissaoDaAba !== "function") return [];
  return Object.keys(MODULOS).filter((ch) => MODULOS[ch].abas.some(temPermissaoDaAba));
}
function temTrabalhoCasca() { return modulosDeTrabalhoCasca().length > 0; }
// abre uma aba aberta a todos (a Ouvidoria, os Documentos da Igreja) dentro do módulo dela
function irAbaAbertaCasca(aba) {
  const ch = typeof MODULOS !== "undefined" ? Object.keys(MODULOS).find((k) => MODULOS[k].abas.includes(aba)) : null;
  if (ch) entrarModulo(ch);
  mostrarAbaSecretaria(aba);
}
function irMenuPrincipalCasca(qual) {
  if (typeof alternarMenuCelular === "function" && window.innerWidth <= 640) alternarMenuCelular(false);
  comTransicaoCasca(() => {
    if (typeof moduloAtual !== "undefined" && moduloAtual) sairDoModulo();
    const sub = { inicio: "perfil", trabalho: "trabalho", vida: "minhavida", perfil: "meuperfil" }[qual] || "perfil";
    mostrarSubAbaMeupainel(sub);
    const conteudo = document.querySelector(".conteudo");
    if (conteudo) conteudo.scrollTop = 0;
  });
}
function marcarMenuPrincipalCasca() {
  const parte = parteDoMenuAgora();
  const mapa = { btnMenuInicio: "inicio", btnMenuTrabalho: "trabalho", btnMenuVida: "vida", btnMenuPerfil: "perfil" };
  const temTrabalho = temTrabalhoCasca();
  for (const id of Object.keys(mapa)) {
    const b = document.getElementById(id);
    if (!b) continue;
    if (id === "btnMenuTrabalho") b.style.display = temTrabalho ? "" : "none";
    const ativo = mapa[id] === parte && !(typeof moduloAtual !== "undefined" && moduloAtual);
    b.classList.toggle("ativo", ativo);
    b.setAttribute("aria-current", ativo ? "page" : "false");
    const rotulo = b.querySelector(".rotulo");
    if (rotulo) b.setAttribute("title", rotulo.textContent);
  }
}

// ---- os GRUPOS do menu de cada módulo abrem e fecham com a setinha (rodada 3), e o sistema lembra o que estava fechado ----
const CHAVE_GRUPOS_FECHADOS = "ieadespaGruposFechados";
function gruposFechados() {
  try { const l = JSON.parse(localStorage.getItem(CHAVE_GRUPOS_FECHADOS) || "[]"); return Array.isArray(l) ? l : []; } catch (e) { return []; }
}
function prepararGruposDoMenu() {
  const fechados = gruposFechados();
  document.querySelectorAll(".grupo-modulo .btn-aba").forEach((b) => {
    const sub = b.nextElementSibling;
    if (!sub || !sub.classList.contains("submenu-aba") || !sub.id) return;
    b.classList.add("btn-aba-grupo");
    if (!b.querySelector(".seta-grupo")) b.insertAdjacentHTML("beforeend", `<span class="seta-grupo" aria-hidden="true">${iconeSvg("setaBaixo", 16)}</span>`);
    sub.classList.toggle("fechado", fechados.includes(sub.id));
  });
}
// clicar no grupo que JÁ está aberto (a aba ativa) só recolhe ou abre a lista dele, sem recarregar a tela
document.addEventListener("click", (ev) => {
  const b = ev.target && ev.target.closest ? ev.target.closest(".grupo-modulo .btn-aba.btn-aba-grupo.ativo") : null;
  if (!b) return;
  const sub = b.nextElementSibling;
  if (!sub || !sub.classList.contains("submenu-aba")) return;
  ev.stopImmediatePropagation();
  ev.preventDefault();
  const fechar = !sub.classList.contains("fechado");
  sub.classList.toggle("fechado", fechar);
  const l = gruposFechados().filter((id) => id !== sub.id);
  if (fechar) l.push(sub.id);
  try { localStorage.setItem(CHAVE_GRUPOS_FECHADOS, JSON.stringify(l)); } catch (e) { /* vale só nesta visita */ }
}, true);

// ---- o CAMINHO na barra do topo (v10.5: "Expansão › Missões › Envios") ----
function atualizarTrilhaCasca() {
  const trilha = document.getElementById("trilhaCasca");
  if (!trilha) return;
  // as telas Svelte dizem o caminho delas (ponteSvelteCasca().trilha)
  const externa = trilhaExternaValendo();
  atualizarVoltarCelularCasca();
  if (externa) { desenharTrilhaExternaCasca(trilha, externa); return; }
  const partes = [];   // [rótulo, ação ou null]
  const titulo = (document.getElementById("tituloModulo") || {}).textContent || "";
  const mod = typeof moduloAtual !== "undefined" && moduloAtual && typeof MODULOS !== "undefined" ? MODULOS[moduloAtual] : null;
  if (mod) {
    partes.push([mod.titulo, ["modulo", moduloAtual]]);
    const grupo = document.getElementById(`grupoModulo${capitalize(moduloAtual)}`);
    const aba = grupo ? grupo.querySelector(".btn-aba.ativo .rotulo") : null;
    if (aba) partes.push([aba.textContent.trim(), null]);
    const abaBtn = grupo ? grupo.querySelector(".btn-aba.ativo") : null;
    const sub = abaBtn && abaBtn.nextElementSibling && abaBtn.nextElementSibling.classList.contains("submenu-aba") ? abaBtn.nextElementSibling.querySelector(".btn-subaba.ativo .rotulo") : null;
    if (sub) partes.push([sub.textContent.trim(), null]);
    else if (titulo && !aba) partes.push([titulo, null]);
  } else {
    const sub = typeof subAbaMeupainelAtual !== "undefined" ? subAbaMeupainelAtual : "perfil";
    const parte = parteDoMenuAgora();
    const raiz = { vida: ["Minha vida na igreja", "minhavida"], perfil: ["Meu Perfil", "meuperfil"], trabalho: ["Meu trabalho", "trabalho"] }[parte];
    if (raiz && raiz[1] !== sub && !(parte === "trabalho" && !temTrabalhoCasca())) partes.push([raiz[0], ["sub", raiz[1]]]);
    partes.push([titulo || "Início", null]);
  }
  // nomes repetidos em seguida (ex.: o módulo e a única aba dele com o mesmo nome) aparecem uma vez só
  const limpas = partes.filter((p, i) => p[0] && (i === 0 || p[0].toLowerCase() !== partes[i - 1][0].toLowerCase()));
  trilha.innerHTML = limpas.map((p, i) => {
    const ultimo = i === limpas.length - 1;
    const sep = ultimo ? "" : `<span class="trilha-sep" aria-hidden="true">${iconeSvg("seta", 14)}</span>`;
    if (ultimo) return `<span class="trilha-atual" aria-current="page">${escaparHtmlEbd(p[0])}</span>`;
    const acao = p[1];
    const botao = acao ? `<button type="button" class="trilha-link" data-on-click="irTrilhaCasca" data-args-click="${argsAttr(acao[0], acao[1])}">${escaparHtmlEbd(p[0])}</button>` : `<span class="trilha-parte">${escaparHtmlEbd(p[0])}</span>`;
    return botao + sep;
  }).join("");
}
function irTrilhaCasca(tipo, alvo) {
  if (tipo === "modulo" && typeof entrarModulo === "function") { entrarModuloCasca(alvo); return; }
  if (tipo === "sub") comTransicaoCasca(() => mostrarSubAbaMeupainel(alvo));
}

// ---- celular: as pílulas no alto ----
function pilulaAtivaAgora() {
  const parte = parteDoMenuAgora();
  // o Meu Perfil (e as partes dele) abre pelo ☰: nenhuma pílula fica marcada (aprovado na rodada 12)
  if (parte === "perfil") return "";
  return parte;
}
function atualizarPilulasCelular() {
  marcarMenuPrincipalCasca();
  atualizarTrilhaCasca();
  const nav = document.getElementById("pilulasCelular");
  if (!nav) return;
  const temTrabalho = temTrabalhoCasca();
  const ativa = pilulaAtivaAgora();
  nav.querySelectorAll(".pilula-celular").forEach((b) => {
    const qual = b.dataset.pilula;
    if (qual === "trabalho") b.style.display = temTrabalho ? "" : "none";
    b.classList.toggle("ativa", qual === ativa);
    b.setAttribute("aria-current", qual === ativa ? "page" : "false");
  });
  const badge = document.getElementById("badgeSino");
  const numero = document.getElementById("pilulaAvisosNumero");
  if (numero) {
    const n = badge && badge.style.display !== "none" ? String(badge.textContent || "").trim() : "";
    numero.textContent = n;
    numero.style.display = n && n !== "0" ? "" : "none";
  }
}
function irPilulaCelular(qual) {
  if (qual === "avisos") { alternarPainelNotificacoes(); atualizarPilulasCelular(); return; }
  irMenuPrincipalCasca(qual === "vida" ? "vida" : qual === "trabalho" ? "trabalho" : "inicio");
  atualizarPilulasCelular();
}
// ---- incremento 2: a busca do alto (Ctrl K) e o Esc dos painéis do lado ----
document.addEventListener("keydown", (ev) => {
  const painelBusca = document.getElementById("painelBuscaGlobal");
  if ((ev.ctrlKey || ev.metaKey) && !ev.altKey && String(ev.key).toLowerCase() === "k") {
    const conteudo = document.getElementById("cxPainelConteudo");
    if (!conteudo || conteudo.style.display === "none") return;   // só dentro do sistema (com sessão)
    ev.preventDefault();
    abrirPainelBusca();
    return;
  }
  if (ev.key === "Escape") {
    const algumAberto = ["painelBuscaGlobal", "painelNotificacoes"].some((id) => { const p = document.getElementById(id); return p && p.style.display !== "none"; });
    if (algumAberto) { ev.preventDefault(); fecharPaineisLado(); }
    return;
  }
  if (ev.key === "Enter" && painelBusca && painelBusca.style.display !== "none" && ev.target && ev.target.id === "campoBuscaLado") {
    const primeiro = document.querySelector("#resultadosBuscaGlobal .item-notificacao");
    if (primeiro) { ev.preventDefault(); primeiro.click(); }
  }
});
document.addEventListener("DOMContentLoaded", () => {
  // tocar no campo de busca do topo abre o painel do lado (com o campo no alto dele)
  const campoTopo = document.getElementById("campoBuscaGlobal");
  if (campoTopo) campoTopo.addEventListener("focus", () => abrirPainelBusca());
});

// ---- a pessoa: o cartão no pé do menu (as iniciais, o nome e o papel) e o escopo do Início ----
let membroCasca = null;
function guardarMembroCasca(membro) {
  membroCasca = membro && typeof membro === "object" ? membro : null;
  atualizarCartaoUsuarioCasca();
  atualizarEscopoInicioCasca();
}
function iniciaisCasca(nome) {
  const p = String(nome || "").trim().split(/\s+/).filter(Boolean);
  if (!p.length) return "";
  return (p[0][0] + (p.length > 1 ? p[p.length - 1][0] : "")).toUpperCase();
}
function papelCasca() {
  if (typeof authGeral !== "undefined" && authGeral) return "Nível geral";
  return temTrabalhoCasca() ? "Liderança" : "Membro";
}
function congregacaoCasca() {
  const c = membroCasca && membroCasca.congregacao ? String(membroCasca.congregacao).trim() : "";
  return !c ? "" : /^congrega/i.test(c) ? c : `Congregação ${c}`;
}
function lugarCasca() {
  if (typeof authGeral !== "undefined" && authGeral) return "a Igreja toda";
  return congregacaoCasca();
}
function atualizarCartaoUsuarioCasca() {
  const ini = document.getElementById("usuarioIniciais");
  if (ini) ini.textContent = iniciaisCasca(typeof authNome !== "undefined" ? authNome : "");
  const papel = document.getElementById("usuarioPapel");
  if (papel) papel.textContent = [papelCasca(), lugarCasca() === "a Igreja toda" ? "" : (membroCasca && membroCasca.congregacao) || ""].filter(Boolean).join(" · ");
  marcarMenuPrincipalCasca();
}
function atualizarEscopoInicioCasca() {
  const esc = document.getElementById("inicioEscopo");
  if (esc) esc.textContent = [papelCasca(), lugarCasca()].filter(Boolean).join(" · ");
  const trab = document.getElementById("trabalhoEscopo");
  if (trab) trab.textContent = "Os módulos que você cuida e o que está esperando por você em cada um.";
}

// ---- o INÍCIO (rodadas 3 e 4): "Para você hoje" e "Meu trabalho" com as 2 principais pendências de cada módulo ----
// De onde vem cada pendência: os AVISOS que o sistema já calcula (a categoria diz de que módulo é) e as TAREFAS dos fluxos (a permissão da etapa
// diz o módulo). Módulo sem nenhuma regra de aviso no sistema mostra só o que ele tem (o "resumo"), sem número inventado.
const MODULO_DA_CATEGORIA = {
  FINANCEIRO: "financeiro", PATRIMONIO: "financeiro", CALENDARIO: "calendario", CANAIS: "canais", COMUNICACAO: "canais", CRISE: "crise", CUIDADO: "cuidadopastoral",
  DISTRITOS: "expansao", EBD: "ebd", ENTIDADES: "entidades", ESCALAS: "escalas", EVENTOS: "eventos", EXPANSAO: "expansao", MISSOES: "expansao", EXTENSAO_TENDA: "expansao",
  FORMACAO: "trilhas", IDENTIDADE: "eclesiastica", MEDIACAO: "disciplina", MENORES: "habilitacao", PROTECAO: "habilitacao", CONGREGACAO: "territorio"
};
// a parte de Minha vida para os avisos de quem não cuida do módulo (o membro escalado, o pai com a criança no check-in...)
const SUB_DA_CATEGORIA = { ESCALAS: "minhasescalas", COMUNICACAO: "comunicacoes", CALENDARIO: "agenda", CUIDADO: "cuidado", MENORES: "checkininfantil", IDENTIDADE: "identidade", FORMACAO: "minhaformacao", EVENTOS: "eventos", CANAIS: "canais" };
const MODULOS_COM_AVISO = new Set(Object.values(MODULO_DA_CATEGORIA));
let dadosInicioCasca = { avisos: [], tarefas: [], carregado: false };
function moduloDaTarefa(t) {
  const perm = t && t.responsavelPermissao;
  if (!perm || typeof MODULOS === "undefined") return null;
  return Object.keys(MODULOS).find((ch) => MODULOS[ch].abas.some((a) => (typeof permissoesDaAba === "function" ? permissoesDaAba(a) : [a]).includes(perm))) || null;
}
function dataCurta(iso) { const d = new Date(iso); return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }); }
// as pendências de cada módulo: as tarefas primeiro (estão com a pessoa), depois os avisos não lidos, juntando os de mesmo título
function pendenciasPorModulo() {
  const porModulo = {};
  const por = (ch) => (porModulo[ch] = porModulo[ch] || { itens: [], total: 0 });
  for (const t of dadosInicioCasca.tarefas) {
    const ch = moduloDaTarefa(t);
    if (!ch) continue;
    const m = por(ch);
    m.itens.push(`${t.etapaNome || t.tipoFluxoNome}${t.prazoEtapaEm ? " · até " + dataCurta(t.prazoEtapaEm) : ""}`);
    m.total++;
  }
  const grupos = {};
  for (const n of dadosInicioCasca.avisos) {
    if (n.lida) continue;
    const ch = MODULO_DA_CATEGORIA[n.categoria];
    if (!ch) continue;
    const k = ch + "|" + n.titulo;
    grupos[k] = grupos[k] || { ch, titulo: n.titulo, n: 0 };
    grupos[k].n++;
  }
  for (const g of Object.values(grupos)) {
    const m = por(g.ch);
    m.itens.push(g.n > 1 ? `${g.titulo} (${g.n})` : g.titulo);
    m.total += g.n;
  }
  return porModulo;
}
function cartaoModuloCasca(ch, pend) {
  const m = MODULOS[ch];
  const p = pend[ch];
  let meio, selo;
  if (p && p.total) {
    meio = `<ul class="cartao-modulo-tarefas">${p.itens.slice(0, 2).map((x) => `<li>${escaparHtmlEbd(x)}</li>`).join("")}</ul>`;
    selo = `<span class="chip-casca chip-pendente">${escaparHtmlEbd(String(p.total))} ${p.total === 1 ? "pendência" : "pendências"}</span>`;
  } else if (MODULOS_COM_AVISO.has(ch)) {
    meio = `<p class="cartao-modulo-resumo">${escaparHtmlEbd(m.resumo || "")}</p>`;
    selo = `<span class="chip-casca chip-emdia">Em dia</span>`;
  } else {
    meio = `<p class="cartao-modulo-resumo">${escaparHtmlEbd(m.resumo || "")}</p>`;
    selo = "";
  }
  return `<div class="card-modulo" data-modulo="${escaparHtmlEbd(ch)}" data-cor="${escaparHtmlEbd(ch)}" data-on-click="entrarModuloCasca" data-args-click="${argsAttr(ch)}" tabindex="0" role="button" data-on-keydown="ativarComTeclado" data-args-keydown="${argsAttr(ARG.evento, ARG.elemento)}">
      <div class="cartao-modulo-cabeca">${tileCasca(ch, m.icone, 22)}<strong>${escaparHtmlEbd(m.titulo)}</strong></div>${meio}${selo ? `<div>${selo}</div>` : ""}
    </div>`;
}
function desenharCartoesModulosCasca(idAlvo) {
  const alvo = document.getElementById(idAlvo || "gradeModulos");
  if (!alvo || typeof MODULOS === "undefined") return;
  const chaves = modulosDeTrabalhoCasca();
  const temTrabalho = chaves.length > 0;
  if (!idAlvo || idAlvo === "gradeModulos") {
    const secao = document.getElementById("secaoMeuTrabalho");
    if (secao) secao.style.display = temTrabalho ? "" : "none";
    const vida = document.getElementById("secaoVidaInicio");
    if (vida) vida.style.display = temTrabalho ? "none" : "";
    if (!temTrabalho) desenharVidaNoInicioCasca();
  }
  if (!temTrabalho) { alvo.innerHTML = ""; return; }
  const pend = pendenciasPorModulo();
  // quem cuida de muitos módulos vê quadrados (4 por linha); o líder local e o de área, com poucos, veem retângulos (2 por linha) — rodada 3
  alvo.classList.toggle("poucos", chaves.length <= 4);
  alvo.innerHTML = chaves.map((ch) => cartaoModuloCasca(ch, pend)).join("");
}
// "Para você hoje": até 3 — as tarefas que estão com a pessoa e os avisos não lidos (o que de fato espera por ela)
function desenharParaHojeCasca() {
  const cx = document.getElementById("cxPainelInicial");
  const grade = document.getElementById("gradePainelInicial");
  if (!cx || !grade) return;
  const itens = [];
  for (const t of dadosInicioCasca.tarefas) {
    const ch = moduloDaTarefa(t);
    itens.push({ cor: ch || "inicio", icone: ch && MODULOS[ch] ? MODULOS[ch].icone : "tarefa", titulo: t.etapaNome || t.tipoFluxoNome, sub: [t.tipoFluxoNome, t.prazoEtapaEm ? `prazo ${dataCurta(t.prazoEtapaEm)}` : "", t.atrasado ? "atrasada" : ""].filter(Boolean).join(" · "), acao: ["tarefas", ""] });
  }
  const vistos = new Set();
  for (const n of dadosInicioCasca.avisos) {
    if (n.lida || vistos.has(n.titulo)) continue;
    vistos.add(n.titulo);
    const ch = MODULO_DA_CATEGORIA[n.categoria];
    const meu = ch && podeAcessarModulo(ch) && temTrabalhoCasca();
    itens.push({ cor: ch || "inicio", icone: ch && MODULOS[ch] ? MODULOS[ch].icone : "sino", titulo: n.titulo, sub: [meu ? MODULOS[ch].titulo : "", n.mensagem].filter(Boolean).join(" · "),
      acao: meu ? ["modulo", ch] : SUB_DA_CATEGORIA[n.categoria] ? ["sub", SUB_DA_CATEGORIA[n.categoria]] : ["avisos", ""] });
  }
  cx.style.display = "";
  grade.innerHTML = itens.length
    ? itens.slice(0, 3).map((i) => `<div class="cartao-hoje" data-on-click="abrirItemHojeCasca" data-args-click="${argsAttr(i.acao[0], i.acao[1])}" tabindex="0" role="button" data-on-keydown="ativarComTeclado" data-args-keydown="${argsAttr(ARG.evento, ARG.elemento)}">
        ${tileCasca(i.cor, i.icone, 20)}<div class="cartao-hoje-textos"><strong>${escaparHtmlEbd(i.titulo)}</strong><span>${escaparHtmlEbd(i.sub)}</span></div><span class="cartao-hoje-seta" aria-hidden="true">${iconeSvg("seta", 18)}</span>
      </div>`).join("")
    : `<p class="inicio-vazio">Nada esperando por você hoje.</p>`;
}
// o membro (sem cargo) vê, no lugar de "Meu trabalho", os atalhos de "Minha vida na igreja" (rodada 3: grandes, 3 por linha)
const ATALHOS_INICIO_MEMBRO = [["dados", "pessoas", "pessoa", "Meus dados", "Endereço, telefone e família"], ["credencial", "eclesiastica", "cartao", "Minha carteirinha", "Mostrar no celular"],
  ["minhasescalas", "departamentos", "relogio", "Minhas escalas", "Onde e quando você serve"], ["contribuicoes", "financeiro", "dinheiro", "Minhas contribuições", "O que você entregou, mês a mês"],
  ["agenda", "calendario", "calendario", "Agenda da igreja", "Cultos e eventos do mês"], ["cuidado", "assistenciasocial", "coracao", "Pedido de oração", "A liderança ora por você"]];
function desenharVidaNoInicioCasca() {
  const alvo = document.getElementById("inicioVidaAtalhos");
  if (!alvo) return;
  alvo.innerHTML = ATALHOS_INICIO_MEMBRO.map((a) => `<button type="button" class="atalho-vida-grande" data-on-click="mostrarSubAbaMeupainel" data-args-click="${argsAttr(a[0])}">${tileCasca(a[1], a[2], 22)}<span class="atalho-vida-textos"><strong>${escaparHtmlEbd(a[3])}</strong><span>${escaparHtmlEbd(a[4])}</span></span></button>`).join("");
}
function abrirItemHojeCasca(tipo, alvo) {
  if (tipo === "tarefas") { abrirMinhasTarefasDosAvisos(); return; }
  if (tipo === "modulo" && typeof entrarModulo === "function") { entrarModuloCasca(alvo); return; }
  if (tipo === "sub") { comTransicaoCasca(() => mostrarSubAbaMeupainel(alvo)); return; }
  alternarPainelNotificacoes();
}
let inicioCascaSeq = 0;
async function carregarInicioCasca() {
  const seq = ++inicioCascaSeq;
  atualizarEscopoInicioCasca();
  desenharCartoesModulosCasca();
  if (typeof authToken === "undefined" || !authToken) return;
  const avisos = [], tarefas = [];
  try {
    const res = await fetchProtegido(`${API_BASE}/notificacoes?status=abertas`);
    const l = await res.json();
    if (Array.isArray(l)) avisos.push(...l);
  } catch (e) { /* sem os avisos: o Início mostra o resto */ }
  if (typeof sessaoDeLiderancaNaTela === "function" && sessaoDeLiderancaNaTela()) {
    try { const rf = await fetchProtegido(`${API_BASE}/fluxos?filtro=comigo`); const t = await rf.json(); if (Array.isArray(t)) tarefas.push(...t); } catch (e) { /* sem as tarefas */ }
  }
  if (seq !== inicioCascaSeq) return;
  dadosInicioCasca = { avisos, tarefas, carregado: true };
  desenharParaHojeCasca();
  desenharCartoesModulosCasca();
  if (typeof subAbaMeupainelAtual !== "undefined" && subAbaMeupainelAtual === "trabalho") desenharMeuTrabalhoCasca();
}

// ---- MEU TRABALHO: os módulos da pessoa (os mesmos cartões do Início) e as tarefas dela ----
function desenharMeuTrabalhoCasca() {
  atualizarEscopoInicioCasca();
  desenharCartoesModulosCasca("trabalhoCartoes");
  const alvo = document.getElementById("trabalhoAtalhos");
  if (alvo) {
    const n = dadosInicioCasca.tarefas.length;
    alvo.innerHTML = linhaVidaCasca(["tarefas", "inicio", "tarefa", "Minhas tarefas", n ? `${n} esperando por você` : "As etapas dos fluxos que estão com você"]);
  }
  if (!dadosInicioCasca.carregado) carregarInicioCasca();
}

// ---- incremento 3: MEU PERFIL (os quatro cartões — rodada 7, opção 1) e MINHA VIDA NA IGREJA (rodada 7, opção 2) ----
function linhaPerfil(rotulo, valor, acao) {
  return `<div class="perfil-linha"><span>${escaparHtmlEbd(rotulo)}</span><strong>${valor}</strong>${acao || ""}</div>`;
}
const linkPerfil = (sub, rotulo) => `<button type="button" class="btn-link" data-on-click="mostrarSubAbaMeupainel" data-args-click="${argsAttr(String(sub))}">${escaparHtmlEbd(rotulo)}</button>`;
function escolherTemaAcao(modo) {
  try { if (modo === "aparelho") localStorage.removeItem(CHAVE_TEMA); else localStorage.setItem(CHAVE_TEMA, modo); } catch (e) { /* vale só nesta visita */ }
  aplicarTema(modo === "aparelho" ? temaDoAparelho() : modo);
  desenharMeuPerfilCasca();
}
function escolherLetraAcao(grande) {
  const agora = document.documentElement.dataset.readable === "true";
  if (agora !== !!grande) alternarModoLeitura();
  desenharMeuPerfilCasca();
}
function mascararEmail(e) { const s = String(e || ""); const i = s.indexOf("@"); return i > 0 ? s[0] + "*****" + s.slice(i) : s; }
function mascararTelefone(t) { const d = String(t || "").replace(/\D/g, ""); return d.length >= 8 ? `(${d.slice(0, 2)}) ${d.length > 10 ? d.slice(2, 3) : ""}****-${d.slice(-4)}` : String(t || ""); }
let perfilCascaDados = { email: null, telefone: null, chaves: null, sessoes: null };
let perfilCascaSeq = 0;
async function carregarDadosPerfilCasca() {
  const seq = ++perfilCascaSeq;
  if (typeof authToken === "undefined" || !authToken || !authMatricula) return;
  const novo = { email: null, telefone: null, chaves: null, sessoes: null };
  try { const r = await fetchProtegido(`${API_BASE}/meus-dados/${authMatricula}`); const d = await r.json(); if (d && d.sucesso && d.dados) { novo.email = d.dados.email || ""; novo.telefone = d.dados.telefone || ""; } } catch (e) { /* segue sem */ }
  if (typeof sessaoDeLiderancaNaTela === "function" && sessaoDeLiderancaNaTela()) {
    try { const r = await fetchProtegido(`${API_BASE}/chaves-acesso`, { semFator: true }); if (r.status !== 403) { const d = await r.json(); if (d && Array.isArray(d.chaves)) novo.chaves = d.chaves; } } catch (e) { /* segue sem */ }
  }
  try { const r = await fetchProtegido(`${API_BASE}/minhas-sessoes`); const l = await r.json(); if (Array.isArray(l)) novo.sessoes = l.filter((s) => !s.encerrada); } catch (e) { /* segue sem */ }
  if (seq !== perfilCascaSeq) return;
  // o que não veio fica "não informado" (sem o "…" de carregando para sempre)
  for (const k of Object.keys(novo)) if (novo[k] === null) novo[k] = k === "email" || k === "telefone" ? "" : [];
  perfilCascaDados = novo;
  desenharMeuPerfilCasca(true);
}
function desenharMeuPerfilCasca(jaCarregado) {
  const cabeca = document.getElementById("meuPerfilCabeca");
  if (cabeca) {
    const linha = [typeof authNome !== "undefined" ? authNome : "", authMatricula ? `matrícula ${authMatricula}` : "", membroCasca && membroCasca.congregacao ? membroCasca.congregacao : ""].filter(Boolean).join(" · ");
    cabeca.innerHTML = `<span class="perfil-avatar" aria-hidden="true">${escaparHtmlEbd(iniciaisCasca(typeof authNome !== "undefined" ? authNome : ""))}</span>
      <div class="pagina-casca-titulos"><h1 class="inicio-saudacao">Meu Perfil</h1><p class="inicio-escopo">${escaparHtmlEbd(linha)}</p></div>
      <button type="button" class="btn-confirmar btn-secundario btn-sair-casca" data-on-click="sairDoPainel">Sair do sistema</button>`;
  }
  const caixa = document.getElementById("meuPerfilCartoes");
  if (!caixa) return;
  const escolhido = temaEscolhido() || "aparelho";
  const letraGrande = document.documentElement.dataset.readable === "true";
  const chip = (ativo, acao, arg, rotulo) => `<button type="button" class="chip-filtro ${ativo ? "ativo" : ""}" data-on-click="${acao}" data-args-click="${argsAttr(arg)}">${escaparHtmlEbd(rotulo)}</button>`;
  const temPush = "serviceWorker" in navigator && "PushManager" in window;
  const d = perfilCascaDados;
  const esperando = "…";
  const email = d.email === null ? esperando : d.email ? escaparHtmlEbd(mascararEmail(d.email)) : "não cadastrado";
  const tel = d.telefone === null ? esperando : d.telefone ? escaparHtmlEbd(mascararTelefone(d.telefone)) : "não cadastrado";
  const lideranca = typeof sessaoDeLiderancaNaTela === "function" && sessaoDeLiderancaNaTela();
  const chaves = Array.isArray(d.chaves) ? d.chaves.length : null;
  const sessoes = Array.isArray(d.sessoes) ? d.sessoes : null;
  const aparelhos = sessoes === null ? `<p class="subtitle">${esperando}</p>`
    : sessoes.length ? sessoes.slice(0, 3).map((s) => `<div class="perfil-aparelho">${iconeSvg(/android|iphone|celular|mobile/i.test(String(s.dispositivoInfo || "")) ? "celular" : "notebook", 20)}<div class="perfil-aparelho-textos"><strong>${escaparHtmlEbd(String(s.dispositivoInfo || "Aparelho").slice(0, 60))}</strong><span>entrou em ${escaparHtmlEbd(new Date(s.criadoEm).toLocaleDateString("pt-BR"))}</span></div><button type="button" class="btn-link btn-link-perigo" data-on-click="encerrarSessaoAcao" data-args-click="${argsAttr(String(s.sessaoId))}">Sair deste aparelho</button></div>`).join("")
      : `<p class="subtitle">Nenhum outro aparelho com a sua sessão aberta.</p>`;
  caixa.innerHTML = `
    <section class="perfil-cartao" data-qual="dados" data-on-click="abrirCartaoPerfilCasca" data-args-click="${argsAttr("dados")}"><h2>${iconeSvg("pessoa", 20)}Meus dados</h2><p class="perfil-resumo-cel">nome, contato, endereço</p>
      ${linhaPerfil("Nome", escaparHtmlEbd(typeof authNome !== "undefined" && authNome ? authNome : "—"))}
      ${linhaPerfil("Matrícula", escaparHtmlEbd(authMatricula || "—"))}
      ${linhaPerfil("Congregação", escaparHtmlEbd(membroCasca && membroCasca.congregacao ? membroCasca.congregacao : "—"))}
      ${linhaPerfil("E-mail", email, linkPerfil("dados", "Trocar"))}
      ${linhaPerfil("Telefone", tel, linkPerfil("dados", "Trocar"))}
      <div class="perfil-acoes">${linkPerfil("vinculos", "Minha família")}${linkPerfil("lgpd", "Meus dados (LGPD)")}</div>
    </section>
    <section class="perfil-cartao" data-qual="seguranca" data-on-click="abrirCartaoPerfilCasca" data-args-click="${argsAttr("seguranca")}"><h2>${iconeSvg("chave", 20)}Segurança</h2><p class="perfil-resumo-cel">chave do aparelho e senha</p>
      ${lideranca ? linhaPerfil("Chave deste aparelho", chaves === null ? esperando : chaves ? `<span class="chip-casca chip-emdia">Ativa</span> entra com a digital ou o rosto` : "nenhuma ainda", linkPerfil("seguranca", chaves ? "Ver" : "Cadastrar")) : ""}
      ${linhaPerfil(lideranca ? "Senha" : "PIN", "••••••••", linkPerfil("dados", "Trocar"))}
      ${lideranca ? linhaPerfil("Chaves cadastradas", chaves === null ? esperando : String(chaves), linkPerfil("seguranca", "Ver")) : ""}
    </section>
    <section class="perfil-cartao" data-qual="aparelhos" data-on-click="abrirCartaoPerfilCasca" data-args-click="${argsAttr("aparelhos")}"><h2>${iconeSvg("notebook", 20)}Aparelhos de confiança</h2><p class="perfil-resumo-cel">onde a sua sessão está aberta</p>${aparelhos}
      <div class="perfil-acoes">${linkPerfil("seguranca", "Ver todos")}</div>
    </section>
    <section class="perfil-cartao perfil-preferencias"><h2>${iconeSvg("engrenagem", 20)}Preferências</h2>
      <div class="perfil-linha perfil-linha-chips"><span>Aparência</span><span class="perfil-chips">${chip(escolhido === "claro", "escolherTemaAcao", "claro", "Claro")}${chip(escolhido === "escuro", "escolherTemaAcao", "escuro", "Escuro")}${chip(escolhido === "aparelho", "escolherTemaAcao", "aparelho", "Seguir o aparelho")}</span></div>
      ${temPush ? `<div class="perfil-linha perfil-linha-chips"><span>Avisos no celular</span><button type="button" class="btn-link" data-on-click="alternarPushAcao">Ligar ou desligar neste aparelho</button></div>` : ""}
      <div class="perfil-linha perfil-linha-chips"><span>Tamanho da letra</span><span class="perfil-chips">${chip(!letraGrande, "escolherLetraAcao", false, "Normal")}${chip(letraGrande, "escolherLetraAcao", true, "Grande")}</span></div>
      ${ehProducaoCasca() ? "" : `<div class="perfil-linha perfil-linha-chips"><span>Fonte (teste)</span><span class="perfil-chips">${FONTES_TESTE.map((x) => chip((document.documentElement.dataset.fonte || "inter") === x[0], "escolherFonteTesteAcao", x[0], x[1])).join("")}</span></div>`}
    </section>
    <button type="button" class="btn-confirmar btn-secundario btn-sair-cel" data-on-click="sairDoPainel">Sair do sistema</button>`;
  if (!jaCarregado) carregarDadosPerfilCasca();
}

// no celular os cartões do Meu Perfil são quadrados (rodada 12): tocar abre a parte inteira; no notebook o cartão já mostra tudo
function abrirCartaoPerfilCasca(qual) {
  if (window.innerWidth > 640) return;
  mostrarSubAbaMeupainel(qual === "dados" ? "dados" : "seguranca");
}
// MINHA VIDA NA IGREJA: à esquerda os próximos compromissos; à direita "O que é meu" (as 6 principais) e, embaixo, o resto do que é da pessoa
const VIDA_PRINCIPAIS = [["credencial", "eclesiastica", "cartao", "Minha carteirinha", "Mostrar no celular"], ["minhasescalas", "departamentos", "relogio", "Minhas escalas", "Onde e quando você serve"],
  ["contribuicoes", "financeiro", "dinheiro", "Minhas contribuições", "O que você entregou, mês a mês"], ["vinculos", "membresia", "pessoas", "Minha família", "Cônjuge, filhos e parentes"],
  ["cuidado", "assistenciasocial", "coracao", "Pedidos de oração e visita", "A liderança ora por você"], ["minhaformacao", "ebd", "livro", "Minha formação", "Escola Bíblica, AFM e seminário"]];
const VIDA_MAIS = [["agenda", "calendario", "calendario", "Agenda da igreja"], ["votacoes", "eclesiastica", "urna", "Votações"], ["eventos", "eventos", "tenda", "Eventos"],
  ["comunicacoes", "canais", "envelope", "Comunicações"], ["cartas", "membresia", "envelope", "Cartas de trânsito"], ["frequencia", "orgaosCentrais", "grafico", "Minha frequência"],
  ["minhasconquistas", "conquistas", "trofeu", "Minhas conquistas"], ["identidade", "eclesiastica", "paleta", "Identidade visual"], ["canais", "canais", "megafone", "Canais"],
  ["minhahabilitacao", "habilitacao", "escudo", "Minha habilitação"], ["checkininfantil", "habilitacao", "crianca", "Check-in infantil"], ["menores", "habilitacao", "crianca", "Ministério com menores"],
  ["protecao", "habilitacao", "escudo", "Proteção de crianças"], ["setores", "setores", "maleta", "Setores Técnicos"],
  ["aba:ouvidoria", "disciplina", "megafone", "Ouvidoria"], ["aba:documentos", "conformidade", "doc", "Documentos da Igreja"]];
const linhaVidaCasca = (a) => `<button type="button" class="linha-vida" data-on-click="mostrarSubAbaMeupainel" data-args-click="${argsAttr(a[0])}">${tileCasca(a[1], a[2], 20)}<span class="linha-vida-textos"><strong>${escaparHtmlEbd(a[3])}</strong>${a[4] ? `<span>${escaparHtmlEbd(a[4])}</span>` : ""}</span><span class="linha-vida-seta" aria-hidden="true">${iconeSvg("seta", 18)}</span></button>`;
let minhaVidaSeq = 0;
async function carregarMinhaVidaCasca() {
  const atalhos = document.getElementById("minhaVidaAtalhos");
  if (atalhos) {
    atalhos.innerHTML = `<h3 class="vida-titulo">O que é meu</h3><div class="vida-linhas">${VIDA_PRINCIPAIS.map(linhaVidaCasca).join("")}</div>`;
    let mais = document.getElementById("minhaVidaMais");
    if (!mais && atalhos.parentElement) { atalhos.parentElement.insertAdjacentHTML("afterend", `<section class="vida-mais-secao"><h3 class="vida-titulo">Mais da minha vida na igreja</h3><div class="vida-mais" id="minhaVidaMais"></div></section>`); mais = document.getElementById("minhaVidaMais"); }
    if (mais) mais.innerHTML = VIDA_MAIS.map((a) => `<button type="button" class="atalho-vida-mini" data-on-click="${a[0].startsWith("aba:") ? "irAbaAbertaCasca" : "mostrarSubAbaMeupainel"}" data-args-click="${argsAttr(a[0].replace(/^aba:/, ""))}">${tileCasca(a[1], a[2], 18)}<span>${escaparHtmlEbd(a[3])}</span></button>`).join("");
  }
  const lista = document.getElementById("minhaVidaCompromissos");
  if (!lista) return;
  const seq = ++minhaVidaSeq;
  lista.innerHTML = "<p class=\"subtitle\">Carregando…</p>";
  const itens = [];
  const agora = Date.now();
  try {
    const res = await fetchProtegido(`${API_BASE}/escalas/minhas-alocacoes`);
    const data = await res.json();
    (data && Array.isArray(data.alocacoes) ? data.alocacoes : []).forEach((a) => {
      const quando = Date.parse(a.dataHora);
      if (!Number.isNaN(quando) && quando >= agora - 3600e3 && a.status !== "RECUSADO") itens.push({ quando, titulo: `${a.equipeNome || "Escala"} — escala`, detalhe: [a.descricao, a.status === "CONVIDADO" ? "convite para responder" : ""].filter(Boolean).join(" · ") });
    });
  } catch (e) { /* sem escalas: segue com a agenda */ }
  try {
    if (typeof calObter === "function" && typeof calHojeBrasilia === "function" && typeof calSomarDias === "function") {
      const hoje = calHojeBrasilia();
      const data = await calObter(`agenda?de=${hoje}&ate=${calSomarDias(hoje, 30)}&camadas=OFICIAL`);
      (data && Array.isArray(data.itens) ? data.itens : []).filter((i) => i.camada === "OFICIAL" && i.status === "HOMOLOGADO").slice(0, 8).forEach((i) => {
        const quando = Date.parse(String(i.data || "").slice(0, 10) + "T12:00:00");
        if (!Number.isNaN(quando)) itens.push({ quando, titulo: i.titulo || i.nome || "Evento", detalhe: i.congregacaoNome || i.local || "" });
      });
    }
  } catch (e) { /* sem agenda: segue com as escalas */ }
  if (seq !== minhaVidaSeq) return;
  itens.sort((x, y) => x.quando - y.quando);
  const proximos = itens.slice(0, 6);
  lista.innerHTML = proximos.length
    ? proximos.map((i) => {
      const d = new Date(i.quando);
      const mes = d.toLocaleDateString("pt-BR", { month: "short" }).replace(/\./g, "");
      const semana = d.toLocaleDateString("pt-BR", { weekday: "short" }).replace(/\./g, "");
      return `<div class="vida-item"><div class="vida-data"><strong>${String(d.getDate()).padStart(2, "0")}</strong><span>${escaparHtmlEbd(semana)} · ${escaparHtmlEbd(mes)}</span></div><div><div class="vida-item-titulo">${escaparHtmlEbd(i.titulo)}</div><div class="subtitle">${escaparHtmlEbd(i.detalhe)}</div></div></div>`;
    }).join("")
    : "<p class=\"subtitle\">Nenhum compromisso nos próximos dias.</p>";
}

// ---- incremento 4: o menu de cada módulo NA COR DO MÓDULO, com o cabeçalho colorido (o nome do módulo e de quem está vendo) ----
// entrarModulo()/sairDoModulo() chamam esta função; a cor vem do CSS (.painel-layout[data-modulo="..."]), aqui só a marca e o texto.
function marcarModuloNaCasca(chave) {
  const painel = document.getElementById("cxPainelConteudo");
  if (!painel) return;
  const m = chave && typeof MODULOS !== "undefined" ? MODULOS[chave] : null;
  if (!m) { delete painel.dataset.modulo; setTimeout(atualizarPilulasCelular, 0); return; }
  painel.dataset.modulo = chave;
  const icone = document.getElementById("menuModuloIcone");
  const titulo = document.getElementById("menuModuloTitulo");
  const escopo = document.getElementById("menuModuloEscopo");
  if (icone) icone.innerHTML = iconeSvg(m.icone, 20);
  if (titulo) titulo.textContent = m.titulo || "";
  if (escopo) escopo.textContent = textoNivelDaSessao();
  setTimeout(atualizarPilulasCelular, 0);
}
// quem está vendo (o nível da sessão), para o cabeçalho do módulo
const ROTULOS_NIVEL_CASCA = { GLOBAL: "Geral", DISTRITO: "Distrito", AREA: "Área", CONGREGACAO: "Congregação", LOCAL: "Local", DEPARTAMENTO: "Departamento" };
function textoNivelDaSessao() {
  if (typeof authGeral !== "undefined" && authGeral) return "Nível geral · a Igreja toda";
  const nivel = typeof authNivel !== "undefined" ? authNivel : null;
  return nivel ? "Nível: " + (ROTULOS_NIVEL_CASCA[nivel] || String(nivel).toLowerCase()) : "";
}

// ---- incremento 4: os números das tabelas alinhados à direita (só a apresentação) ----
// A coluna em que TODO valor preenchido é número ou dinheiro ("12", "1.250,00", "R$ 80,00", "35%") ganha a classe casca-num;
// datas ("04/10/2026") e textos ficam à esquerda. Tabelas com células mescladas no corpo ficam como estão.
const RX_NUMERO_TABELA = /^[-+]?(R\$\s?)?[-+]?\d[\d.\s]*(,\d+)?\s?%?$/;
function alinharNumerosDasTabelas() {
  const painel = document.getElementById("cxPainelConteudo");
  if (!painel) return;
  painel.querySelectorAll("table.tabela-frequencia, table.tabela-simples").forEach((tab) => {
    const linhas = [];
    for (const corpo of tab.tBodies) for (const r of corpo.rows) linhas.push(r);
    if (!linhas.length) return;
    const ncol = linhas[0].cells.length;
    if (linhas.some((r) => r.cells.length !== ncol || [...r.cells].some((c) => c.colSpan > 1))) return;
    const cab = tab.tHead && tab.tHead.rows.length ? tab.tHead.rows[tab.tHead.rows.length - 1] : null;
    for (let c = 0; c < ncol; c++) {
      let numeros = 0, outros = 0;
      for (const r of linhas) {
        const t = r.cells[c].textContent.trim();
        if (!t || t === "-" || t === "—") continue;
        if (RX_NUMERO_TABELA.test(t)) numeros++; else outros++;
      }
      const num = numeros > 0 && outros === 0;
      for (const r of linhas) r.cells[c].classList.toggle("casca-num", num);
      if (cab && cab.cells.length === ncol && cab.cells[c]) cab.cells[c].classList.toggle("casca-num", num);
    }
  });
}
let alinharNumerosEspera = null;
(function vigiarTabelas() {
  const painel = document.getElementById("cxPainelConteudo");
  if (!painel || typeof MutationObserver !== "function") return;
  new MutationObserver(() => {
    if (alinharNumerosEspera) clearTimeout(alinharNumerosEspera);
    alinharNumerosEspera = setTimeout(() => { alinharNumerosEspera = null; alinharNumerosDasTabelas(); }, 120);
  }).observe(painel, { childList: true, subtree: true });
})();

// qualquer toque pode trocar de tela: a pílula ativa, o item do menu e o caminho do topo acompanham (os botões do menu chamam as funções direto)
document.addEventListener("click", () => setTimeout(atualizarPilulasCelular, 0));

// ---- FASE 10 (19/11/2026): as TELAS NOVAS EM SVELTE (o código em front/, o build versionado em app/svelte). O arquivo do módulo só é baixado quando a pessoa
// entra nele (ou abre a Minha vida); a casca entrega a PONTE (front/src/comum/ponte.ts): o fetch autenticado, a sessão, os ícones de traço, os avisos,
// o caminho do topo e o menu. Sem script em linha (a CSP continua 'self'): o módulo vem por import() do próprio endereço. ----
const svelteCarregados = {};
function carregarModuloSvelte(nome) {
  if (!/^[a-z-]+$/.test(nome)) return Promise.reject(new Error("módulo inválido"));
  if (!svelteCarregados[nome]) {
    if (!document.querySelector(`link[data-svelte="${nome}"]`)) {
      const css = document.createElement("link");
      css.rel = "stylesheet";
      css.href = `/svelte/${nome}.css`;
      css.dataset.svelte = nome;
      document.head.appendChild(css);
    }
    svelteCarregados[nome] = import(`/svelte/${nome}.js`).catch((e) => { delete svelteCarregados[nome]; throw e; });
  }
  return svelteCarregados[nome];
}
// o caminho do topo, o título do celular e o ← de uma tela Svelte (contexto: o módulo ou a parte do Meu Painel em que ela está)
let trilhaExternaCasca = null;
function trilhaExternaValendo() {
  const t = trilhaExternaCasca;
  if (!t) return null;
  if (t.contexto === "membresia") return typeof moduloAtual !== "undefined" && moduloAtual === "membresia" ? t : null;
  return (typeof moduloAtual === "undefined" || !moduloAtual) && typeof subAbaMeupainelAtual !== "undefined" && subAbaMeupainelAtual === t.contexto ? t : null;
}
function desenharTrilhaExternaCasca(trilha, t) {
  trilha.innerHTML = t.partes.map((p, i) => {
    const ultimo = i === t.partes.length - 1;
    if (ultimo) return `<span class="trilha-atual" aria-current="page">${escaparHtmlEbd(p.rotulo)}</span>`;
    const parte = typeof p.ir === "function"
      ? `<button type="button" class="trilha-link" data-on-click="irTrilhaExternaCasca" data-args-click="${argsAttr(i)}">${escaparHtmlEbd(p.rotulo)}</button>`
      : `<span class="trilha-parte">${escaparHtmlEbd(p.rotulo)}</span>`;
    return parte + `<span class="trilha-sep" aria-hidden="true">${iconeSvg("seta", 14)}</span>`;
  }).join("");
  const titulo = document.getElementById("tituloModulo");
  if (titulo && titulo.textContent !== t.tituloCelular) titulo.textContent = t.tituloCelular;
}
function irTrilhaExternaCasca(i) {
  const t = trilhaExternaValendo();
  const p = t && t.partes[Number(i)];
  if (p && typeof p.ir === "function") p.ir();
}
// o ← do topo no celular (as telas de dentro de um módulo Svelte)
function atualizarVoltarCelularCasca() {
  const t = trilhaExternaValendo();
  const btn = document.getElementById("btnVoltarCelular");
  const painel = document.getElementById("cxPainelConteudo");
  const com = !!(t && typeof t.voltar === "function");
  if (btn) btn.hidden = !com;
  if (painel) painel.classList.toggle("com-voltar", com);
}
function voltarCelularCasca() {
  const t = trilhaExternaValendo();
  if (t && typeof t.voltar === "function") t.voltar();
}
let menuRecolhidoPeloSvelte = false;
function ponteSvelteCasca(contexto) {
  return {
    apiBase: API_BASE,
    pedir: (url, opcoes) => fetchProtegido(url, opcoes || {}),
    sessao: () => ({
      matricula: String(authMatricula || ""), nome: String(authNome || ""), permissoes: Array.isArray(authPermissoes) ? authPermissoes.slice() : [],
      geral: !!authGeral, nivel: authNivel || null, congregacao: (membroCasca && membroCasca.congregacao) || null
    }),
    icones: ICONES_CASCA,
    avisar: (texto, tipo) => mostrarToast(String(texto || ""), tipo === "erro" ? "erro" : "sucesso"),
    trilha: (partes, tituloCelular, voltar) => {
      trilhaExternaCasca = { contexto, partes: Array.isArray(partes) ? partes : [], tituloCelular: String(tituloCelular || ""), voltar: typeof voltar === "function" ? voltar : null };
      atualizarTrilhaCasca();
    },
    menuRecolhido: (recolher) => {
      const sb = document.getElementById("sidebar");
      if (!sb || window.innerWidth <= 640) return;
      if (recolher === true) {
        if (!sb.classList.contains("recolhido")) { sb.classList.add("recolhido"); menuRecolhidoPeloSvelte = true; }
      } else if (menuRecolhidoPeloSvelte) {
        // devolve a escolha que a pessoa deixou guardada
        let guardado = false;
        try { guardado = localStorage.getItem(CHAVE_MENU_RECOLHIDO) === "1"; } catch (e) { /* sem armazenamento */ }
        sb.classList.toggle("recolhido", guardado);
        menuRecolhidoPeloSvelte = false;
      }
    },
    sairDoModulo: () => { if (typeof moduloAtual !== "undefined" && moduloAtual) sairDoModulo(); },
    irMeuPainel: (sub) => irMinhaParteCasca(String(sub || "minhavida")),
    abrirMembros: (rota) => abrirMembrosCasca(rota),
    fecharGavetaCelular: () => { if (window.innerWidth <= 640 && typeof alternarMenuCelular === "function") alternarMenuCelular(false); },
    escopoDoModulo: (texto) => { const el = document.getElementById("menuModuloEscopo"); if (el) el.textContent = String(texto || ""); }
  };
}
function irMinhaParteCasca(sub) {
  comTransicaoCasca(() => {
    if (typeof moduloAtual !== "undefined" && moduloAtual) sairDoModulo();
    mostrarSubAbaMeupainel(sub);
  });
}
// o módulo Membros: o menu vai para a barra da esquerda e as telas para #membrosRaiz
let membrosSvelteMontado = false;
function abrirMembrosSvelte(rota) {
  const menu = document.getElementById("membrosMenuRaiz");
  const conteudo = document.getElementById("membrosRaiz");
  if (!menu || !conteudo) return;
  if (!membrosSvelteMontado) conteudo.innerHTML = "<p class=\"subtitle\" style=\"padding:8px 0\">Abrindo Membros…</p>";
  carregarModuloSvelte("membros").then((m) => {
    if (typeof moduloAtual === "undefined" || moduloAtual !== "membresia") return;   // a pessoa saiu antes de baixar
    if (!membrosSvelteMontado) conteudo.innerHTML = "";
    m.montar({ menu, conteudo }, ponteSvelteCasca("membresia"), rota || undefined);
    membrosSvelteMontado = true;
  }).catch(() => {
    conteudo.innerHTML = "<p class=\"subtitle aviso-recusa\">Não deu para abrir Membros agora. Confira a internet e tente de novo.</p>";
  });
}
function fecharMembrosSvelte() {
  if (!membrosSvelteMontado) return;
  membrosSvelteMontado = false;
  if (trilhaExternaCasca && trilhaExternaCasca.contexto === "membresia") trilhaExternaCasca = null;
  carregarModuloSvelte("membros").then((m) => m.desmontar()).catch(() => { /* nada montado */ });
  ponteSvelteCasca("membresia").menuRecolhido(null);
  atualizarVoltarCelularCasca();
}
// chamada pela troca de aba (mostrarAbaSecretaria): entrar em "membros" abre as telas novas; sair desmonta
function svAbaMudou(aba) {
  if (aba === "membros") abrirMembrosSvelte(null);
  else fecharMembrosSvelte();
}
// abrir Membros já numa tela (a busca do alto acha uma pessoa; a Minha vida pede a ficha de alguém)
function abrirMembrosCasca(rota) {
  if (typeof moduloAtual === "undefined" || moduloAtual !== "membresia") {
    comTransicaoCasca(() => { entrarModulo("membresia"); abrirMembrosSvelte(rota || null); });
    return;
  }
  abrirMembrosSvelte(rota || null);
}
// a MINHA VIDA (rodada 10, versão final): a minha ficha no alto da página da casca; o resto da página (compromissos, o que é meu) continua embaixo
let minhaVidaSvelteMontada = false;
function abrirMinhaVidaSvelte(parte) {
  const alvo = document.getElementById("mvFicha");
  if (!alvo || !authMatricula) return;
  carregarModuloSvelte("membros").then((m) => {
    if (typeof subAbaMeupainelAtual === "undefined" || subAbaMeupainelAtual !== "minhavida") return;
    m.montarMinhaVida(alvo, ponteSvelteCasca("minhavida"), parte || undefined);
    minhaVidaSvelteMontada = true;
  }).catch(() => {
    alvo.innerHTML = "<p class=\"subtitle aviso-recusa\">Não deu para abrir a sua ficha agora. Confira a internet e tente de novo.</p>";
  });
}
function svSubMudou(sub) {
  if (sub === "minhavida") { abrirMinhaVidaSvelte(); return; }
  if (!minhaVidaSvelteMontada) return;
  minhaVidaSvelteMontada = false;
  if (trilhaExternaCasca && trilhaExternaCasca.contexto === "minhavida") trilhaExternaCasca = null;
  carregarModuloSvelte("membros").then((m) => m.desmontarMinhaVida()).catch(() => { /* nada montado */ });
  atualizarVoltarCelularCasca();
}

registrarAcoes({ irTrilhaExternaCasca, voltarCelularCasca, abrirCartaoPerfilCasca, abrirItemHojeCasca, alternarMenuRecolhidoCasca, entrarModuloCasca, escolherFonteTesteAcao, irAbaAbertaCasca, alternarTemaAcao, escolherLetraAcao, escolherTemaAcao, irMenuPrincipalCasca, irPilulaCelular, irTrilhaCasca });
