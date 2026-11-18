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
  if (sub === "perfil") return "inicio";
  // o Meu Perfil (e as partes dele) abre pelo ☰: nenhuma pílula fica marcada (aprovado na rodada 12)
  if (["meuperfil", "dados", "vinculos", "seguranca", "lgpd"].includes(sub)) return "";
  return "vida";
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
    // "Minha vida na igreja" (incremento 3): os próximos compromissos e o que é da pessoa
    if (typeof moduloAtual !== "undefined" && moduloAtual) sairDoModulo();
    mostrarSubAbaMeupainel("minhavida");
    atualizarPilulasCelular();
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

// ---- incremento 3: MEU PERFIL (os quatro cartões) e MINHA VIDA NA IGREJA (os próximos compromissos) ----
function botaoIrPara(sub, rotulo) {
  return `<button type="button" class="btn-link" data-on-click="mostrarSubAbaMeupainel" data-args-click="${argsAttr(String(sub))}">${escaparHtmlEbd(rotulo)} ›</button>`;
}
function linhaPerfil(rotulo, valor) {
  return `<div class="perfil-linha"><span>${escaparHtmlEbd(rotulo)}</span><strong>${escaparHtmlEbd(valor)}</strong></div>`;
}
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
function desenharMeuPerfilCasca() {
  const caixa = document.getElementById("meuPerfilCartoes");
  if (!caixa) return;
  const escolhido = temaEscolhido() || "aparelho";
  const letraGrande = document.documentElement.dataset.readable === "true";
  const chip = (ativo, acao, arg, rotulo) => `<button type="button" class="chip-filtro ${ativo ? "ativo" : ""}" data-on-click="${acao}" data-args-click="${argsAttr(arg)}">${escaparHtmlEbd(rotulo)}</button>`;
  const temPush = "serviceWorker" in navigator && "PushManager" in window;
  caixa.innerHTML = `
    <section class="perfil-cartao"><h3>👤 Meus dados</h3>
      ${linhaPerfil("Nome", authNome || "—")}${linhaPerfil("Matrícula", authMatricula || "—")}
      <div class="perfil-acoes">${botaoIrPara("dados", "Ver e corrigir os meus dados")}${botaoIrPara("vinculos", "Minha família")}${botaoIrPara("lgpd", "Meus dados (LGPD)")}</div>
    </section>
    <section class="perfil-cartao"><h3>🔑 Segurança</h3>
      <p class="subtitle">A chave deste aparelho (a digital ou o rosto), a senha e o PIN de 4 números.</p>
      <div class="perfil-acoes">${botaoIrPara("seguranca", "Chaves de acesso e senha")}${botaoIrPara("dados", "Trocar o PIN")}</div>
    </section>
    <section class="perfil-cartao"><h3>💻 Aparelhos de confiança</h3>
      <p class="subtitle">Os aparelhos com a sua sessão aberta. Viu um que não é seu? Saia dele.</p>
      <div class="perfil-acoes">${botaoIrPara("seguranca", "Ver os aparelhos e sair de um")}</div>
    </section>
    <section class="perfil-cartao"><h3>⚙️ Preferências</h3>
      <div class="perfil-linha perfil-linha-chips"><span>Aparência</span><span class="perfil-chips">${chip(escolhido === "claro", "escolherTemaAcao", "claro", "Claro")}${chip(escolhido === "escuro", "escolherTemaAcao", "escuro", "Escuro")}${chip(escolhido === "aparelho", "escolherTemaAcao", "aparelho", "Seguir o aparelho")}</span></div>
      <div class="perfil-linha perfil-linha-chips"><span>Tamanho da letra</span><span class="perfil-chips">${chip(!letraGrande, "escolherLetraAcao", false, "Normal")}${chip(letraGrande, "escolherLetraAcao", true, "Grande")}</span></div>
      ${temPush ? `<div class="perfil-linha perfil-linha-chips"><span>Avisos no celular</span><button type="button" class="btn-link" data-on-click="alternarPushAcao">Ligar ou desligar neste aparelho</button></div>` : ""}
    </section>`;
}

const ATALHOS_VIDA = [["credencial", "🪪", "Minha carteirinha"], ["minhasescalas", "🗓️", "Minhas escalas"], ["contribuicoes", "💰", "Minhas contribuições"], ["vinculos", "👪", "Minha família"], ["votacoes", "🗳️", "Votações"], ["eventos", "🎪", "Eventos"]];
let minhaVidaSeq = 0;
async function carregarMinhaVidaCasca() {
  const atalhos = document.getElementById("minhaVidaAtalhos");
  if (atalhos) atalhos.innerHTML = ATALHOS_VIDA.map((a) => `<button type="button" class="vida-atalho" data-on-click="mostrarSubAbaMeupainel" data-args-click="${argsAttr(a[0])}"><span class="vida-atalho-icone">${escaparHtmlEbd(a[1])}</span><span>${escaparHtmlEbd(a[2])}</span></button>`).join("");
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
      const semana = d.toLocaleDateString("pt-BR", { weekday: "long" });
      const detalhe = [semana, i.detalhe].filter(Boolean).join(" · ");
      return `<div class="vida-item"><div class="vida-data"><strong>${String(d.getDate()).padStart(2, "0")}</strong><span>${escaparHtmlEbd(mes)}</span></div><div><div class="vida-item-titulo">${escaparHtmlEbd(i.titulo)}</div><div class="subtitle">${escaparHtmlEbd(detalhe)}</div></div></div>`;
    }).join("")
    : "<p class=\"subtitle\">Nenhum compromisso nos próximos dias.</p>";
}

// ---- incremento 4: o menu de cada módulo NA COR DO MÓDULO, com o cabeçalho colorido (o nome do módulo e de quem está vendo) ----
// entrarModulo()/sairDoModulo() chamam esta função; a cor vem do CSS (.painel-layout[data-modulo="..."]), aqui só a marca e o texto.
function marcarModuloNaCasca(chave) {
  const painel = document.getElementById("cxPainelConteudo");
  if (!painel) return;
  const m = chave && typeof MODULOS !== "undefined" ? MODULOS[chave] : null;
  if (!m) { delete painel.dataset.modulo; return; }
  painel.dataset.modulo = chave;
  const icone = document.getElementById("menuModuloIcone");
  const titulo = document.getElementById("menuModuloTitulo");
  const escopo = document.getElementById("menuModuloEscopo");
  if (icone) icone.textContent = m.icone || "";
  if (titulo) titulo.textContent = m.titulo || "";
  if (escopo) escopo.textContent = textoNivelDaSessao();
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

// qualquer toque pode trocar de tela: a pílula ativa acompanha (os botões do menu chamam as funções direto)
document.addEventListener("click", () => setTimeout(atualizarPilulasCelular, 0));

registrarAcoes({ alternarTemaAcao, escolherLetraAcao, escolherTemaAcao, irPilulaCelular });
