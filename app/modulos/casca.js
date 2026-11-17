// modulos/casca.js — FASE 10, a CASCA NOVA aprovada pelo responsável (rodadas 2 a 7 e 12; docs/plano/fase-10-experiencia-design-performance.md):
// o modo claro/escuro escolhido no topo (e lembrado neste aparelho; sem escolha, segue o aparelho), a entrada como primeira tela (quem já tem
// sessão vai direto para o Início) e, no celular, o menu em ABAS EM PÍLULAS no alto (Início, Trabalho, Minha vida, Avisos — o membro sem
// "Trabalho"), com nada preso embaixo. Mesmo escopo global dos outros módulos (vD.2); os botões passam pelo registrarAcoes.

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
    btn.textContent = final === "escuro" ? "☀️" : "🌙";
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

// ---- a entrada: a primeira tela é "entrar no sistema"; com sessão aberta, vai direto para o Início ----
document.addEventListener("DOMContentLoaded", () => {
  aplicarTema(document.documentElement.dataset.tema);
  const entrada = document.getElementById("telaPainel");
  const login = document.getElementById("cxLoginPainel");
  if (entrada && login && entrada.style.display !== "none" && login.style.display !== "none" && typeof authToken !== "undefined" && authToken && authMatricula) {
    mostrarTelaPainelInicial();
  }
  atualizarPilulasCelular();
  // o número do sino aparece também na pílula "Avisos"
  const badge = document.getElementById("badgeSino");
  if (badge && typeof MutationObserver === "function") new MutationObserver(atualizarPilulasCelular).observe(badge, { childList: true, characterData: true, subtree: true, attributes: true });
});

// ---- celular: as pílulas no alto ----
function pilulaAtivaAgora() {
  if (typeof moduloAtual !== "undefined" && moduloAtual) return "trabalho";
  const sub = typeof subAbaMeupainelAtual !== "undefined" ? subAbaMeupainelAtual : "perfil";
  return sub === "perfil" ? "inicio" : "vida";
}
function atualizarPilulasCelular() {
  const nav = document.getElementById("pilulasCelular");
  if (!nav) return;
  // "Trabalho" só para quem tem PERMISSÃO em algum módulo: as abas abertas a todos (Documentos, Ouvidoria) não fazem do membro um obreiro
  const temTrabalho = typeof MODULOS !== "undefined" && typeof temPermissaoDaAba === "function" && Object.keys(MODULOS).some((ch) => MODULOS[ch].abas.some(temPermissaoDaAba));
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
  if (qual === "vida") {
    // "Minha vida na igreja": o grupo do menu com o que é da pessoa (a tela própria aprovada vem no incremento 3)
    if (typeof moduloAtual !== "undefined" && moduloAtual) sairDoModulo();
    alternarMenuCelular(true);
    const grupo = document.getElementById("grupoMenuMinhaVida");
    if (grupo && grupo.scrollIntoView) grupo.scrollIntoView({ block: "start" });
    return;
  }
  sairDoModulo();
  mostrarSubAbaMeupainel("perfil");
  if (qual === "trabalho") {
    const grade = document.getElementById("rotuloMeuTrabalho") || document.getElementById("gradeModulos");
    if (grade && grade.scrollIntoView) grade.scrollIntoView({ block: "start", behavior: "smooth" });
  }
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

// qualquer toque pode trocar de tela: a pílula ativa acompanha (os botões do menu chamam as funções direto)
document.addEventListener("click", () => setTimeout(atualizarPilulasCelular, 0));

registrarAcoes({ alternarTemaAcao, irPilulaCelular });
