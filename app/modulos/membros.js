// app/modulos/membros.js — FASE 10, v10.1b passo 7a (18/11/2026): o MÓDULO MEMBROS na casca nova, fiel aos desenhos aprovados pelo responsável (rodadas 8 a
// 10 da gestão de membros; docs/plano/fase-10-experiencia-design-performance.md):
//   - o PAINEL EXECUTIVO: os números no alto, o gráfico grande que cada um AJUSTA (o recorte, o agrupamento, quantidade ou %), as entradas e saídas, como
//     está o cadastro e os AVISOS SÓ DE MEMBROS ("só o que eu preciso resolver") — no notebook numa coluna à direita, no celular numa faixa no alto;
//   - a LISTA confortável: 20 por página pedidas ao servidor (?pagina=), os filtros numa linha, a escala local / área / Geral;
//   - a FICHA 360: no notebook o menu principal recolhido e o submenu da ficha À DIREITA (cresce para baixo); no celular as partes em pílulas no alto. A
//     linha do tempo (todos veem), a vida espiritual, o CPF mascarado ("Mostrar" só para a Secretaria Geral, com a leitura registrada no servidor) e a
//     EDIÇÃO CAMPO A CAMPO com "quem mudou o quê" (passo 5: /ficha/campos, /ficha/campo, /ficha/alteracoes).
// As partes da ficha que ainda não ganharam tela nova (família, casamentos, foto, marcos...) são as de antes, trazidas para dentro da ficha nova.
// Mesmo escopo global dos outros módulos (vD.2); as ações passam pelo registrarAcoes (CSP forte); tudo o que vem do servidor passa por escaparHtmlEbd/argsAttr.

const MB_SITUACAO = { EM_COMUNHAO: "Em comunhão", CONGREGADO: "Congregado", SEM_COMUNHAO: "Sem comunhão" };
const MB_SITUACAO_CHIP = { EM_COMUNHAO: "mb-chip mb-chip-verde", CONGREGADO: "mb-chip mb-chip-ambar", SEM_COMUNHAO: "mb-chip mb-chip-vermelho" };
const MB_STATUS_SAIU = { DESLIGADO: "Desligado do rol", FALECIDO: "Falecido" };
const MB_STATUS_ROTULO = { ATIVO: "Ativo", "LICENÇA": "De licença", INATIVO: "Inativo", DESLIGADO: "Desligado", FALECIDO: "Falecido" };
const MB_SEXO = { M: "Masculino", F: "Feminino" };
const MB_ESTADO_CIVIL = { SOLTEIRO: "Solteiro(a)", CASADO: "Casado(a)", VIUVO: "Viúvo(a)", DIVORCIADO: "Divorciado(a)", UNIAO_ESTAVEL: "União estável" };
const MB_ESCOLARIDADE = {
  FUNDAMENTAL_INCOMPLETO: "Fundamental incompleto", FUNDAMENTAL_COMPLETO: "Fundamental completo", MEDIO_INCOMPLETO: "Médio incompleto",
  MEDIO_COMPLETO: "Médio completo", SUPERIOR_INCOMPLETO: "Superior incompleto", SUPERIOR_COMPLETO: "Superior completo", POS_GRADUACAO: "Pós-graduação"
};
const MB_FORMA_ADMISSAO = { BATISMO: "Batismo", CARTA_MUDANCA: "Carta de mudança", RECONCILIACAO: "Reconciliação", ACLAMACAO: "Aclamação" };
const MB_OPCOES_DO_CAMPO = { sexo: MB_SEXO, estadoCivil: MB_ESTADO_CIVIL, escolaridade: MB_ESCOLARIDADE, formaAdmissao: MB_FORMA_ADMISSAO };
// as chaves da trilha que não são campos da ficha (o cadastro completo grava a ficha inteira): o nome em português, nunca o código
const MB_ROTULO_CHAVE = {
  status: "Situação no rol", situacaoMembro: "Situação", congregacaoId: "Congregação", extensaoId: "Extensão da Tenda", cargoMinisterial: "Cargo",
  dizimistaFiel: "Dizimista fiel", dataAfastamento: "Data do afastamento", dataSaida: "Data da saída", motivoSaida: "Motivo da saída",
  fotoUrl: "Foto", cargoDesde: "No cargo desde", funcao: "Função", enderecoPartes: "Endereço", membroId: "Matrícula", nome: "Nome"
};
const MB_GRUPOS_FICHA = ["Dados pessoais", "Filiação", "Contato", "Na igreja", "Vida espiritual"];
const MB_QUEM_MUDA = { MUDA: "muda", SO_GERAL: "só a Geral", SE_VAZIO: "só se estiver vazio", SUGERE: "sugere", NAO: "não muda" };
const MB_ICONE_CATEGORIA = {
  ENTRADA: "⭐", ESPIRITUAL: "🕊️", MINISTERIO: "🛡️", CREDENCIAL: "🪪", CONGREGACAO: "↪", FAMILIA: "💍", CARTAS: "✉️", LICENCA: "🗳️", DISCIPLINA: "⚖️", SAIDA: "🚪"
};
// o gráfico grande: o que mostrar (o recorte) e como agrupar (aprovado na rodada 10: "podendo personalizar a vontade dos gráficos")
const MB_RECORTES = {
  es: { titulo: "Batizados no Espírito Santo", sim: "Batizados no Espírito Santo", nao: "ainda não", nome: "batismo no Espírito Santo" },
  aguas: { titulo: "Batizados nas águas", sim: "Batizados nas águas", nao: "ainda não", nome: "batismo nas águas" },
  cpf: { titulo: "CPF no cadastro", sim: "Com CPF", nao: "sem CPF", nome: "CPF no cadastro" },
  comunhao: { titulo: "Em comunhão", sim: "Em comunhão", nao: "outras situações", nome: "em comunhão" },
  completo: { titulo: "Cadastro completo", sim: "Cadastro completo", nao: "falta dado", nome: "cadastro completo" }
};
const MB_AGRUPAR = { departamento: "por departamento", congregacao: "por congregação", sexo: "por sexo", faixa: "por faixa de idade" };
const MB_MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const MB_MESES_LONGOS = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const MB_CHAVE_AJUSTE = "ieadespaMembrosGrafico";
const MB_POR_PAGINA = 20;
const MB_FALTAS = { cpf: "Sem CPF", nascimento: "Sem nascimento", contato: "Sem e-mail nem celular", departamento: "Sem departamento", sexo: "Sem sexo" };
const MB_ROL = { 1: "No rol", saidas: "Quem saiu", todos: "Todos" };
// as partes da ficha (o submenu da direita): as novas e as de antes trazidas para dentro (a aba antiga do perfil que cada uma usa)
const MB_PARTES_FICHA = [
  ["resumo", "🏠", "Resumo"], ["dados", "👤", "Dados pessoais"], ["familia", "👪", "Família"], ["casamentos", "💍", "Casamentos"],
  ["apresentacoes", "👶", "Apresentação de filhos"], ["historico", "🕊️", "Marcos da vida espiritual"], ["caminhada", "🌱", "Caminhada e formação"],
  ["foto", "📷", "Foto"], ["licenca", "🗳️", "Licença para candidatura"], ["cadastro", "📋", "Cadastro completo"], ["alteracoes", "🕒", "Alterações"]
];
const MB_PARTE_ANTIGA = { familia: "vinculos", casamentos: "casamentos", apresentacoes: "apresentacoes", historico: "historico", caminhada: "caminhada", foto: "foto", licenca: "licenca", cadastro: "editar" };
const MB_ABAS_ANTIGAS = ["Editar", "Historico", "Caminhada", "Foto", "Casamentos", "Apresentacoes", "Licenca", "Vinculos"];

const mbTem = (obj, chave) => Object.prototype.hasOwnProperty.call(obj, chave);
const mbNum = (v) => Number(v) || 0;
const mbFmt = (v) => (Number(v) || 0).toLocaleString("pt-BR");
const mbPlural = (n, um, varios) => (Number(n) === 1 ? um : varios);
function mbDataBr(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ""));
  return m ? `${m[3]}/${m[2]}/${m[1]}` : "";
}
function mbIdade(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ""));
  if (!m) return null;
  const hoje = new Date();
  let idade = hoje.getFullYear() - Number(m[1]);
  if (hoje.getMonth() + 1 < Number(m[2]) || (hoje.getMonth() + 1 === Number(m[2]) && hoje.getDate() < Number(m[3]))) idade -= 1;
  return idade >= 0 && idade < 130 ? idade : null;
}
function mbIniciais(nome) {
  const partes = String(nome || "").trim().split(/\s+/).filter(Boolean);
  if (!partes.length) return "?";
  return ((partes[0][0] || "") + (partes.length > 1 ? partes[partes.length - 1][0] : "")).toUpperCase();
}
// o celular no cabeçalho da ficha: só os 4 últimos números à vista (a ficha inteira tem o número, para quem pode ver)
function mbTelefoneMascarado(t) {
  const d = String(t || "").replace(/\D/g, "");
  if (d.length < 8) return "";
  // 11 números (DDD + 9 dígitos) ou 10 (DDD + 8); com o 55 do país na frente, o DDD continua nas mesmas posições contadas do fim
  const nove = d.length === 9 || d.length >= 11;
  const ddd = d.length >= 10 ? d.slice(nove ? -11 : -10, nove ? -9 : -8) : "";
  return `${ddd ? `(${ddd}) ` : ""}${nove ? d.slice(-9, -8) : ""}****-${d.slice(-4)}`;
}
// o valor de um campo como gente lê (nunca o código): "SUPERIOR_COMPLETO" -> "Superior completo", "1990-03-14" -> "14/03/1990"
function mbTextoDoValor(chave, valor) {
  if (valor === null || valor === undefined || valor === "") return "";
  const mapa = mbTem(MB_OPCOES_DO_CAMPO, chave) ? MB_OPCOES_DO_CAMPO[chave] : null;
  if (mapa && mbTem(mapa, String(valor))) return mapa[String(valor)];
  if (chave === "departamentoId") return (typeof nomeDepartamentoPorId === "function" && nomeDepartamentoPorId(valor)) || "Departamento nº " + String(valor);
  if (chave === "situacaoMembro" && mbTem(MB_SITUACAO, String(valor))) return MB_SITUACAO[String(valor)];
  if (chave === "status") return mbTem(MB_STATUS_ROTULO, String(valor)) ? MB_STATUS_ROTULO[String(valor)] : String(valor).charAt(0) + String(valor).slice(1).toLowerCase();
  if (chave === "congregacaoId") { const c = (mbPainel.congregacoes || []).find((x) => String(x.congregacaoId) === String(valor)); return c ? c.nome : "Congregação nº " + String(valor); }
  if (chave === "extensaoId") return "Extensão nº " + String(valor);
  if (chave === "cargoMinisterial" && typeof LABEL_CARGO_MINISTERIAL !== "undefined" && mbTem(LABEL_CARGO_MINISTERIAL, String(valor))) return LABEL_CARGO_MINISTERIAL[String(valor)];
  if (/^data/i.test(chave) && /^\d{4}-\d{2}-\d{2}/.test(String(valor))) return mbDataBr(valor);
  if (valor === true) return "Sim";
  if (valor === false) return "Não";
  if (typeof valor === "object") return "(alterado)";
  return String(valor);
}
function mbRotuloDaChave(chave, rotulo) {
  if (rotulo && rotulo !== chave) return rotulo;
  if (mbTem(MB_ROTULO_CHAVE, chave)) return MB_ROTULO_CHAVE[chave];
  const t = String(chave || "").replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase();
  return t.charAt(0).toUpperCase() + t.slice(1);
}
function mbEhGeral() { return typeof geralPara === "function" ? geralPara("pessoas") : !!authGeral; }

// ================================================================= o estado das três telas
let mbPainel = { dados: null, congregacaoId: "", congregacoes: [], seq: 0, avisos: null, avisosSeq: 0, soResolver: true, ajusteAberto: false };
let mbLista = { pagina: 1, busca: "", congregacaoId: "", situacao: "", departamentoId: "", falta: "", rol: "1", seq: 0, espera: null, total: 0 };
function mbFichaVazia() {
  return { membroId: null, pessoa: null, parte: "resumo", campos: null, linha: null, linhaPagina: 1, alteracoes: null, altPagina: 1, editando: null,
    erroCampo: null, cpfInteiro: null, seq: 0, quemMudaAberto: false };
}
let mbFicha = mbFichaVazia();
let mbMenuRecolhidoPelaFicha = false;
function mbLerAjuste() {
  let salvo = null;
  try { salvo = JSON.parse(localStorage.getItem(MB_CHAVE_AJUSTE) || "null"); } catch (e) { salvo = null; }
  const s = salvo && typeof salvo === "object" ? salvo : {};
  return {
    recorte: typeof s.recorte === "string" && mbTem(MB_RECORTES, s.recorte) ? s.recorte : "es",
    agrupar: typeof s.agrupar === "string" && mbTem(MB_AGRUPAR, s.agrupar) ? s.agrupar : "departamento",
    modo: s.modo === "pct" ? "pct" : "qtd"
  };
}
let mbAjuste = mbLerAjuste();

// ================================================================= as pílulas do módulo (celular) e as trocas de tela
function mbMarcarPilulas(sub) {
  const nav = document.getElementById("mbPilulasModulo");
  if (!nav) return;
  const marcada = sub === "ficha" ? "lista" : sub;
  nav.style.display = sub === "ficha" ? "none" : "";
  nav.querySelectorAll("[data-sub]").forEach((b) => {
    if (b.dataset.sub === "credenciais") b.style.display = mbEhGeral() ? "" : "none";
    b.classList.toggle("ativa", b.dataset.sub === marcada);
    b.setAttribute("aria-current", b.dataset.sub === marcada ? "page" : "false");
  });
}
// troca de aba (mostrarAbaSecretaria): saindo de Pessoas, a ficha aberta não fica para trás (nem o menu recolhido por ela)
function mbAbaMudou(aba) {
  if (aba !== "pessoas" && subAbaPessoasAtual === "ficha") mbSaiuDaFicha();
}
function mbSaiuDaFicha() {
  if (mbMenuRecolhidoPelaFicha) {
    const sb = document.getElementById("sidebar");
    if (sb) sb.classList.remove("recolhido");
    mbMenuRecolhidoPelaFicha = false;
  }
  mbFicha.cpfInteiro = null;
  const cabeca = document.getElementById("mbFichaCabeca");
  if (cabeca) cabeca.innerHTML = "";
}
function mbFichaAberta() { return subAbaPessoasAtual === "ficha" && !!mbFicha.membroId; }
function mbFichaPodeAbrir() { return !!mbFicha.membroId; }
// algo foi salvo por uma tela antiga (cadastro completo, foto, casamento...): quem está aberto se relê, sem baixar o cadastro inteiro
async function mbDadosMudaram() {
  mbPainel.dados = mbPainel.dados ? Object.assign({}, mbPainel.dados, { velho: true }) : null;
  if (subAbaPessoasAtual === "ficha" && mbFicha.membroId) { mbFicha.campos = null; mbFicha.alteracoes = null; mbFicha.linha = null; await mbRecarregarPessoa(); return; }
  if (subAbaPessoasAtual === "lista") await mbCarregarLista();
  if (subAbaPessoasAtual === "visao") await mbCarregarPainel();
}

// ================================================================= o PAINEL EXECUTIVO
async function mbCarregarPainel() {
  const caixa = document.getElementById("subPessoasVisao");
  if (!caixa) return;
  const seq = ++mbPainel.seq;
  if (!mbPainel.dados) caixa.innerHTML = `${mbTopoHtml("Membros", "Carregando os números…", "")}<p class="subtitle">Carregando…</p>`;
  mbCarregarAvisos();
  const filtro = mbPainel.congregacaoId ? `&congregacaoId=${encodeURIComponent(mbPainel.congregacaoId)}` : "";
  let data = null;
  try {
    const res = await fetchProtegido(`${API_BASE}/pessoas?resumo=1${filtro}`);
    if (seq !== mbPainel.seq) return;
    data = await jsonDaTela(res, caixa);
  } catch (e) {
    if (seq === mbPainel.seq) caixa.innerHTML = "<p class=\"subtitle aviso-recusa\">⚠️ Não deu para ler os números agora. Confira a internet e abra de novo.</p>";
    return;
  }
  if (seq !== mbPainel.seq || !data || !data.resumo) return;
  mbPainel.dados = data.resumo;
  if (!mbPainel.congregacaoId) mbPainel.congregacoes = Array.isArray(data.resumo.congregacoes) ? data.resumo.congregacoes : [];
  mbDesenharPainel();
}
function mbTextoEscopo(r, congregacaoId) {
  const congs = mbPainel.congregacoes || [];
  if (congregacaoId) {
    const c = congs.find((x) => String(x.congregacaoId) === String(congregacaoId));
    return c ? `Congregação ${c.nome}` : "Uma congregação";
  }
  if (mbEhGeral()) return `Igreja toda · ${mbFmt(congs.length)} ${mbPlural(congs.length, "congregação", "congregações")}`;
  if (congs.length === 1) return `Congregação ${congs[0].nome}`;
  return `${authNivel === "AREA" ? "Área · " : ""}${mbFmt(congs.length)} ${mbPlural(congs.length, "congregação", "congregações")}`;
}
function mbTopoHtml(titulo, subtitulo, acoes) {
  return `<div class="mb-topo"><div class="mb-topo-texto"><h3 class="mb-titulo">${escaparHtmlEbd(titulo)}</h3><p class="mb-sub">${escaparHtmlEbd(subtitulo)}</p></div>
    <div class="mb-topo-acoes">${acoes}</div></div>`;
}
function mbSeletorCongregacao(onde, valor) {
  const congs = mbPainel.congregacoes || [];
  if (congs.length <= 1) return congs.length ? `<span class="mb-chip mb-chip-neutro">🏠 ${escaparHtmlEbd(congs[0].nome)}</span>` : "";
  const todas = mbEhGeral() ? "Igreja toda" : "Todas as minhas";
  const opcoes = congs.map((c) => `<option value="${c.congregacaoId}"${String(c.congregacaoId) === String(valor) ? " selected" : ""}>${escaparHtmlEbd(c.nome)}</option>`).join("");
  return `<label class="mb-rotulo-escondido" for="mbCong${onde === "painel" ? "Painel" : "Lista"}">Congregação</label>
    <select id="mbCong${onde === "painel" ? "Painel" : "Lista"}" class="mb-select" data-on-change="mbEscolherCongregacaoAcao" data-args-change="${argsAttr(onde, ARG.valor)}">
      <option value="">${escaparHtmlEbd(todas)}</option>${opcoes}</select>`;
}
function mbBotaoCadastrar() {
  return `<button type="button" class="btn-confirmar mb-btn" data-on-click="mostrarSubAbaPessoas" data-args-click="${argsAttr("cadastrar")}">＋ Cadastrar pessoa</button>`;
}
function mbNumeroHtml(rotulo, valor, detalhe, classe, situacao) {
  const conteudo = `<span class="mb-numero-rotulo">${escaparHtmlEbd(rotulo)}</span><strong class="mb-numero-valor ${classe}">${mbFmt(valor)}</strong><span class="mb-numero-detalhe">${detalhe}</span>`;
  return situacao
    ? `<button type="button" class="mb-cartao mb-numero" data-on-click="mbAbrirListaSituacaoAcao" data-args-click="${argsAttr(situacao)}" title="Ver a lista">${conteudo}</button>`
    : `<div class="mb-cartao mb-numero">${conteudo}</div>`;
}
function mbDesenharPainel() {
  const caixa = document.getElementById("subPessoasVisao");
  const r = mbPainel.dados;
  if (!caixa || !r) return;
  const total = mbNum(r.total);
  const pct = (n) => (total ? Math.round(mbNum(n) * 100 / total) : 0);
  const mes = /^\d{4}-(\d{2})$/.exec(String(r.mesAtual || ""));
  const nomeMes = mes ? MB_MESES_LONGOS[Number(mes[1]) - 1] || "" : "";
  const formas = (r.novosPorForma || []).map((f) => `${mbFmt(f.n)} ${escaparHtmlEbd(f.forma)}`).join(" · ");
  caixa.innerHTML = `
    ${mbTopoHtml("Membros", `${mbTextoEscopo(r, mbPainel.congregacaoId)} · ${mbFmt(total)} ${mbPlural(total, "pessoa", "pessoas")} no rol`, mbSeletorCongregacao("painel", mbPainel.congregacaoId) + mbBotaoCadastrar())}
    <div class="mb-painel">
      <aside class="mb-cartao mb-avisos" id="mbAvisos" aria-label="Avisos de Membros">${mbAvisosHtml()}</aside>
      <div class="mb-painel-principal">
        <div class="mb-numeros">
          ${mbNumeroHtml("Em comunhão", r.emComunhao, `${pct(r.emComunhao)}% do rol`, "mb-cor-verde", "EM_COMUNHAO")}
          ${mbNumeroHtml("Congregados", r.congregados, "ainda não são membros", "", "CONGREGADO")}
          ${mbNumeroHtml("Sem comunhão", r.semComunhao, "afastados da comunhão", "mb-cor-vermelha", "SEM_COMUNHAO")}
          ${mbNumeroHtml(`Novos em ${nomeMes}`, r.novosNoMes, formas || "ninguém entrou ainda", "", "")}
        </div>
        <section class="mb-cartao mb-grafico" id="mbGraficoGrande">${mbGraficoGrandeHtml()}</section>
        <div class="mb-graficos-menores">
          <section class="mb-cartao mb-grafico">${mbMovimentoHtml(r)}</section>
          <section class="mb-cartao mb-grafico">${mbCadastroHtml(r)}</section>
        </div>
      </div>
    </div>`;
}
// os grupos do gráfico: até 8 barras (o resto somado em "Outros"), para caber sem rolagem
function mbAte8(grupos, recorte) {
  const lista = Array.isArray(grupos) ? grupos : [];
  if (lista.length <= 8) return lista;
  const resto = lista.slice(7);
  const outros = { nome: `Outros (${resto.length})`, total: 0 };
  outros[recorte] = 0;
  for (const g of resto) { outros.total += mbNum(g.total); outros[recorte] += mbNum(g[recorte]); }
  return [...lista.slice(0, 7), outros];
}
function mbGraficoGrandeHtml() {
  const r = mbPainel.dados || {};
  const aj = mbAjuste;
  const rec = MB_RECORTES[aj.recorte];
  const grupos = mbAte8((r.grupos || {})[aj.agrupar], aj.recorte);
  const totalSim = grupos.reduce((s, g) => s + mbNum(g[aj.recorte]), 0);
  const totalGeral = grupos.reduce((s, g) => s + mbNum(g.total), 0);
  const maior = Math.max(1, ...grupos.map((g) => mbNum(g.total)));
  const opcoesRecorte = Object.keys(MB_RECORTES).map((k) => `<option value="${escaparHtmlEbd(k)}"${k === aj.recorte ? " selected" : ""}>Recorte: ${escaparHtmlEbd(MB_RECORTES[k].nome)}</option>`).join("");
  const opcoesAgrupar = Object.keys(MB_AGRUPAR).map((k) => `<option value="${escaparHtmlEbd(k)}"${k === aj.agrupar ? " selected" : ""}>${escaparHtmlEbd(MB_AGRUPAR[k].charAt(0).toUpperCase() + MB_AGRUPAR[k].slice(1))}</option>`).join("");
  const linhas = grupos.map((g) => {
    const t = mbNum(g.total);
    const sim = Math.min(t, mbNum(g[aj.recorte]));
    const nao = t - sim;
    const base = aj.modo === "pct" ? Math.max(1, t) : maior;
    const largSim = Math.round(sim * 1000 / base) / 10;
    const largNao = Math.round(nao * 1000 / base) / 10;
    const valor = aj.modo === "pct" ? `${t ? Math.round(sim * 100 / t) : 0}%` : `${mbFmt(nao)} ${escaparHtmlEbd(rec.nao)}`;
    return `<div class="mb-barra-linha" title="${escaparHtmlEbd(g.nome)}: ${mbFmt(sim)} de ${mbFmt(t)}">
      <span class="mb-barra-nome">${escaparHtmlEbd(g.nome)}</span>
      <span class="mb-barra"><span class="mb-barra-sim" style="width:${largSim}%"></span><span class="mb-barra-nao" style="width:${largNao}%"></span></span>
      <span class="mb-barra-valor">${valor}</span></div>`;
  }).join("");
  return `
    <header class="mb-cartao-cabeca"><h4>${escaparHtmlEbd(rec.titulo)}, ${escaparHtmlEbd(MB_AGRUPAR[aj.agrupar])}</h4><span class="mb-dica">para a campanha</span></header>
    <div class="mb-ajuste-linha">
      <label class="mb-rotulo-escondido" for="mbRecorte">O que mostrar</label>
      <select id="mbRecorte" class="mb-select mb-select-chip" data-on-change="mbAjustarGraficoAcao" data-args-change="${argsAttr("recorte", ARG.valor)}">${opcoesRecorte}</select>
      <label class="mb-rotulo-escondido" for="mbAgrupar">Agrupar</label>
      <select id="mbAgrupar" class="mb-select mb-select-chip" data-on-change="mbAjustarGraficoAcao" data-args-change="${argsAttr("agrupar", ARG.valor)}">${opcoesAgrupar}</select>
      <button type="button" class="mb-btn-ajuste" data-on-click="mbAlternarAjusteAcao" aria-expanded="${mbPainel.ajusteAberto ? "true" : "false"}">⚙️ Ajustar os gráficos</button>
    </div>
    ${mbPainel.ajusteAberto ? `<div class="mb-ajuste">
      <span class="mb-ajuste-rotulo">Mostrar em</span>
      <button type="button" class="chip-filtro ${aj.modo === "qtd" ? "ativo" : ""}" data-on-click="mbAjustarGraficoAcao" data-args-click="${argsAttr("modo", "qtd")}">Quantidade</button>
      <button type="button" class="chip-filtro ${aj.modo === "pct" ? "ativo" : ""}" data-on-click="mbAjustarGraficoAcao" data-args-click="${argsAttr("modo", "pct")}">Porcentagem</button>
      <button type="button" class="btn-link" data-on-click="mbAjustarGraficoAcao" data-args-click="${argsAttr("padrao", "")}">Voltar ao padrão</button>
      <span class="mb-dica">A escolha fica guardada neste aparelho.</span>
    </div>` : ""}
    <div class="mb-legenda"><span><i class="mb-ponto mb-ponto-azul"></i>${escaparHtmlEbd(rec.sim)} <strong>${mbFmt(totalSim)}</strong></span>
      <span><i class="mb-ponto mb-ponto-laranja"></i>${escaparHtmlEbd(rec.nao.charAt(0).toUpperCase() + rec.nao.slice(1))} <strong>${mbFmt(totalGeral - totalSim)}</strong></span></div>
    <div class="mb-barras">${linhas || "<p class=\"subtitle\">Ninguém no rol ainda.</p>"}</div>`;
}
function mbMovimentoHtml(r) {
  const meses = Array.isArray(r.movimento) ? r.movimento : [];
  const entradas = meses.reduce((s, m) => s + mbNum(m.entradas), 0);
  const saidas = meses.reduce((s, m) => s + mbNum(m.saidas), 0);
  const maior = Math.max(1, ...meses.map((m) => Math.max(mbNum(m.entradas), mbNum(m.saidas))));
  const colunas = meses.map((m) => {
    const ms = /^\d{4}-(\d{2})$/.exec(String(m.mes || ""));
    const nome = ms ? MB_MESES[Number(ms[1]) - 1] || "" : "";
    const hE = Math.round(mbNum(m.entradas) * 100 / maior);
    const hS = Math.round(mbNum(m.saidas) * 100 / maior);
    return `<div class="mb-coluna-grupo" title="${escaparHtmlEbd(nome)}: ${mbFmt(m.entradas)} ${mbPlural(m.entradas, "entrada", "entradas")}, ${mbFmt(m.saidas)} ${mbPlural(m.saidas, "saída", "saídas")}">
      <div class="mb-coluna-barras"><span class="mb-coluna mb-coluna-azul" style="height:${hE}%"></span><span class="mb-coluna mb-coluna-laranja" style="height:${hS}%"></span></div>
      <span class="mb-coluna-mes">${escaparHtmlEbd(nome)}</span></div>`;
  }).join("");
  return `<header class="mb-cartao-cabeca"><h4>Entradas e saídas</h4><span class="mb-dica">últimos 6 meses</span></header>
    <div class="mb-legenda"><span><i class="mb-ponto mb-ponto-azul"></i>Entradas <strong>${mbFmt(entradas)}</strong></span><span><i class="mb-ponto mb-ponto-laranja"></i>Saídas <strong>${mbFmt(saidas)}</strong></span></div>
    <div class="mb-colunas">${colunas}</div>`;
}
function mbCadastroHtml(r) {
  const total = mbNum(r.total);
  const linha = (rotulo, n, falta) => {
    const p = total ? Math.round(mbNum(n) * 100 / total) : 0;
    const corpo = `<span class="mb-progresso-rotulo"><span>${escaparHtmlEbd(rotulo)}</span><strong>${p}%</strong></span><span class="mb-progresso"><span style="width:${p}%"></span></span>`;
    return falta && p < 100
      ? `<button type="button" class="mb-progresso-linha" data-on-click="mbAbrirListaFiltradaAcao" data-args-click="${argsAttr(falta)}" title="Ver quem falta">${corpo}</button>`
      : `<div class="mb-progresso-linha">${corpo}</div>`;
  };
  return `<header class="mb-cartao-cabeca"><h4>Como está o cadastro</h4><span class="mb-dica">do rol</span></header>
    ${linha("Cadastro completo", r.completos, "")}
    ${linha("Com CPF", total - mbNum(r.semCpf), "cpf")}
    ${linha("Com e-mail ou celular", total - mbNum(r.semContato), "contato")}
    ${linha("Batizados no Espírito Santo", r.batizadosEspirito, "")}
    ${linha("Em comunhão", r.emComunhao, "")}`;
}

// ---- os AVISOS do módulo (só de Membros; o sino do alto continua com os do sistema todo) ----
async function mbCarregarAvisos() {
  const seq = ++mbPainel.avisosSeq;
  const contar = async (url, comoContar) => {
    try {
      const res = await fetchProtegido(url);
      if (!res.ok) return null;
      return comoContar(await res.json());
    } catch (e) { return null; }
  };
  const [sugestoes, preCadastros, transferencias] = await Promise.all([
    contar(`${API_BASE}/fila-aprovacoes`, (d) => (Array.isArray(d) ? d.length : null)),
    contar(`${API_BASE}/pre-cadastros?caixa=fila&porPagina=1`, (d) => (d && d.sucesso ? mbNum(d.total) : null)),
    contar(`${API_BASE}/transferencias?caixa=chegando&porPagina=1`, (d) => (d && d.sucesso ? mbNum(d.total) : null))
  ]);
  if (seq !== mbPainel.avisosSeq) return;
  mbPainel.avisos = { sugestoes, preCadastros, transferencias };
  const el = document.getElementById("mbAvisos");
  if (el) el.innerHTML = mbAvisosHtml();
}
function mbItensAvisos() {
  const a = mbPainel.avisos || {};
  const r = mbPainel.dados || {};
  const itens = [];
  if (mbNum(a.transferencias) > 0) itens.push({ meu: true, nivel: "primeiro", icone: "↪", texto: `${mbFmt(a.transferencias)} ${mbPlural(a.transferencias, "pedido de transferência chegando", "pedidos de transferência chegando")}`, detalhe: "aceitar ou recusar a chegada" });
  if (mbNum(a.preCadastros) > 0) itens.push({ meu: true, nivel: "afazer", icone: "📝", texto: `${mbFmt(a.preCadastros)} ${mbPlural(a.preCadastros, "pré-cadastro na fila", "pré-cadastros na fila")}`, detalhe: "falta dado ou parece com outra ficha", acao: "sub", arg: "fila" });
  if (mbNum(a.sugestoes) > 0) itens.push({ meu: true, nivel: "afazer", icone: "✏️", texto: `${mbFmt(a.sugestoes)} ${mbPlural(a.sugestoes, "sugestão de membro para conferir", "sugestões de membros para conferir")}`, detalhe: "aplicar ou recusar com o motivo", acao: "sub", arg: "aprovacoes" });
  if (mbNum(r.semCpf) > 0) itens.push({ meu: false, nivel: "afazer", icone: "🪪", texto: `${mbFmt(r.semCpf)} sem CPF no rol`, detalhe: "o CPF evita ficha repetida", acao: "lista", arg: "cpf" });
  if (mbNum(r.semContato) > 0) itens.push({ meu: false, nivel: "afazer", icone: "📞", texto: `${mbFmt(r.semContato)} sem e-mail nem celular`, detalhe: "sem contato, a pessoa não recebe o código de acesso", acao: "lista", arg: "contato" });
  if (mbNum(r.semNascimento) > 0) itens.push({ meu: false, nivel: "afazer", icone: "🎂", texto: `${mbFmt(r.semNascimento)} sem data de nascimento`, detalhe: "sem ela, a pessoa não vota na assembleia", acao: "lista", arg: "nascimento" });
  if (mbNum(r.semDepartamento) > 0) itens.push({ meu: false, nivel: "info", icone: "👥", texto: `${mbFmt(r.semDepartamento)} sem departamento`, detalhe: "para os gráficos e as campanhas", acao: "lista", arg: "departamento" });
  return itens;
}
const MB_ETIQUETA_AVISO = { primeiro: ["mb-chip mb-chip-vermelho", "Primeiro"], afazer: ["mb-chip mb-chip-ambar", "A fazer"], info: ["mb-chip mb-chip-neutro", "Para saber"] };
function mbAvisosHtml() {
  const todos = mbItensAvisos();
  const meus = todos.filter((i) => i.meu);
  const lista = mbPainel.soResolver ? meus : todos;
  const carregando = !mbPainel.avisos;
  const itens = lista.map((i) => {
    const etiqueta = MB_ETIQUETA_AVISO[i.nivel] || MB_ETIQUETA_AVISO.info;
    const corpo = `<span class="mb-aviso-icone" aria-hidden="true">${escaparHtmlEbd(i.icone)}</span>
      <span class="mb-aviso-texto"><strong>${escaparHtmlEbd(i.texto)}</strong><span>${escaparHtmlEbd(i.detalhe)}</span></span>
      <span class="${escaparHtmlEbd(etiqueta[0])}">${escaparHtmlEbd(etiqueta[1])}</span>`;
    if (i.acao === "lista") return `<button type="button" class="mb-aviso" data-on-click="mbAbrirListaFiltradaAcao" data-args-click="${argsAttr(i.arg)}">${corpo}</button>`;
    if (i.acao === "sub") return `<button type="button" class="mb-aviso" data-on-click="mostrarSubAbaPessoas" data-args-click="${argsAttr(i.arg)}">${corpo}</button>`;
    return `<div class="mb-aviso">${corpo}</div>`;
  }).join("");
  return `<header class="mb-cartao-cabeca"><h4>🔔 Avisos de Membros <span class="mb-contador">${mbFmt(meus.length)}</span></h4><span class="mb-dica">só deste módulo</span></header>
    <div class="mb-avisos-filtro" role="group" aria-label="Quais avisos">
      <button type="button" class="chip-filtro ${mbPainel.soResolver ? "ativo" : ""}" data-on-click="mbAvisosFiltroAcao" data-args-click="${argsAttr(true)}">Só o que eu preciso resolver (${mbFmt(meus.length)})</button>
      <button type="button" class="chip-filtro ${mbPainel.soResolver ? "" : "ativo"}" data-on-click="mbAvisosFiltroAcao" data-args-click="${argsAttr(false)}">Tudo (${mbFmt(todos.length)})</button>
    </div>
    <div class="mb-avisos-lista">${itens || `<p class="mb-vazio-aviso">${carregando ? "Conferindo…" : "✓ Nada para resolver agora."}</p>`}</div>
    <p class="mb-dica mb-avisos-nota">O sino lá de cima continua com os avisos do sistema todo; aqui, só os de Membros.</p>`;
}

// ================================================================= a LISTA (20 por página, pedida ao servidor)
function mbAbrirLista() {
  mbDesenharListaMoldura();
  mbCarregarLista();
  if (!mbPainel.congregacoes.length && !mbPainel.dados) mbGarantirCongregacoes();
}
// a lista das congregações do escopo vem do painel; quem foi direto para a lista lê o painel uma vez (ele é leve: só números)
async function mbGarantirCongregacoes() {
  try {
    const res = await fetchProtegido(`${API_BASE}/pessoas?resumo=1`);
    const data = await res.json();
    if (data && data.sucesso && data.resumo) {
      mbPainel.dados = mbPainel.dados || data.resumo;
      mbPainel.congregacoes = Array.isArray(data.resumo.congregacoes) ? data.resumo.congregacoes : [];
      if (subAbaPessoasAtual === "lista") mbDesenharListaMoldura();
    }
  } catch (e) { /* sem a lista das congregações, o filtro dela não aparece */ }
}
function mbDesenharListaMoldura() {
  const caixa = document.getElementById("subPessoasLista");
  if (!caixa) return;
  const r = mbPainel.dados;
  const sub = r ? `${mbTextoEscopo(r, mbLista.congregacaoId)} · ${mbFmt(r.emComunhao)} em comunhão` : "As pessoas do seu escopo";
  const deps = (window._departamentosCache || []).filter((d) => d.ativo !== false);
  const opcoesDep = deps.map((d) => `<option value="${d.departamentoId}"${String(d.departamentoId) === String(mbLista.departamentoId) ? " selected" : ""}>${escaparHtmlEbd(d.nome)}</option>`).join("");
  const opcoesSit = Object.keys(MB_SITUACAO).map((k) => `<option value="${escaparHtmlEbd(k)}"${k === mbLista.situacao ? " selected" : ""}>${escaparHtmlEbd(MB_SITUACAO[k])}</option>`).join("");
  const opcoesFalta = Object.keys(MB_FALTAS).map((k) => `<option value="${escaparHtmlEbd(k)}"${k === mbLista.falta ? " selected" : ""}>${escaparHtmlEbd(MB_FALTAS[k])}</option>`).join("");
  const opcoesRol = Object.keys(MB_ROL).map((k) => `<option value="${escaparHtmlEbd(k)}"${k === mbLista.rol ? " selected" : ""}>${escaparHtmlEbd(MB_ROL[k])}</option>`).join("");
  const temFiltro = mbLista.busca || mbLista.congregacaoId || mbLista.situacao || mbLista.departamentoId || mbLista.falta || mbLista.rol !== "1";
  caixa.innerHTML = `
    ${mbTopoHtml("Pessoas", sub, mbBotaoCadastrar())}
    <div class="mb-cartao mb-lista">
      <div class="mb-filtros">
        <span class="mb-busca">
          <label class="mb-rotulo-escondido" for="mbBuscaLista">Procurar nesta lista</label>
          <input type="search" id="mbBuscaLista" placeholder="🔍 Nome, matrícula ou CPF" value="${escaparHtmlEbd(mbLista.busca)}" autocomplete="off"
            data-on-input="mbBuscaListaAcao" data-args-input="${argsAttr(ARG.valor)}" />
          <span class="mb-busca-conta" id="mbListaConta"></span>
        </span>
        ${mbSeletorCongregacao("lista", mbLista.congregacaoId)}
        <label class="mb-rotulo-escondido" for="mbFiltroSituacao">Situação</label>
        <select id="mbFiltroSituacao" class="mb-select" data-on-change="mbFiltroListaAcao" data-args-change="${argsAttr("situacao", ARG.valor)}"><option value="">Situação</option>${opcoesSit}</select>
        ${deps.length ? `<label class="mb-rotulo-escondido" for="mbFiltroDep">Departamento</label>
        <select id="mbFiltroDep" class="mb-select" data-on-change="mbFiltroListaAcao" data-args-change="${argsAttr("departamentoId", ARG.valor)}"><option value="">Departamento</option>${opcoesDep}</select>` : ""}
        <label class="mb-rotulo-escondido" for="mbFiltroFalta">O que falta no cadastro</label>
        <select id="mbFiltroFalta" class="mb-select" data-on-change="mbFiltroListaAcao" data-args-change="${argsAttr("falta", ARG.valor)}"><option value="">Cadastro</option>${opcoesFalta}</select>
        <label class="mb-rotulo-escondido" for="mbFiltroRol">Rol</label>
        <select id="mbFiltroRol" class="mb-select" data-on-change="mbFiltroListaAcao" data-args-change="${argsAttr("rol", ARG.valor)}">${opcoesRol}</select>
        ${temFiltro ? "<button type=\"button\" class=\"btn-link\" data-on-click=\"mbLimparFiltrosListaAcao\">Limpar</button>" : ""}
      </div>
      <p class="mb-dica">Esta busca filtra só esta lista enquanto você digita. O Ctrl K, lá em cima, procura no sistema todo (pessoas, relatórios, eventos).</p>
      <div id="mbListaCorpo"><p class="subtitle">Carregando…</p></div>
      <div class="mb-paginacao" id="mbListaPaginas"></div>
    </div>`;
}
async function mbCarregarLista() {
  const corpo = document.getElementById("mbListaCorpo");
  if (!corpo) return;
  const seq = ++mbLista.seq;
  const p = new URLSearchParams({ pagina: String(mbLista.pagina), porPagina: String(MB_POR_PAGINA) });
  if (mbLista.rol === "1" || mbLista.rol === "saidas") p.set("rol", mbLista.rol);
  if (mbLista.busca) p.set("busca", mbLista.busca);
  if (mbLista.congregacaoId) p.set("congregacaoId", mbLista.congregacaoId);
  if (mbLista.situacao) p.set("situacao", mbLista.situacao);
  if (mbLista.departamentoId) p.set("departamentoId", mbLista.departamentoId);
  if (mbLista.falta) p.set("falta", mbLista.falta);
  let data = null;
  try {
    const res = await fetchProtegido(`${API_BASE}/pessoas?${p.toString()}`);
    if (seq !== mbLista.seq) return;
    data = await jsonDaTela(res, corpo);
  } catch (e) {
    if (seq === mbLista.seq) corpo.innerHTML = "<p class=\"subtitle aviso-recusa\">⚠️ Não deu para ler a lista agora. Confira a internet e tente de novo.</p>";
    return;
  }
  if (seq !== mbLista.seq || !data) return;
  const itens = Array.isArray(data.itens) ? data.itens : [];
  mbLista.total = mbNum(data.total);
  // guarda as pessoas da página: a ficha e as partes antigas dela acham a pessoa sem pedir o cadastro inteiro
  window._pessoasCache = mbJuntarNoCache(window._pessoasCache, itens);
  const varias = (mbPainel.congregacoes || []).length > 1 && !mbLista.congregacaoId;
  const conta = document.getElementById("mbListaConta");
  if (conta) { conta.textContent = mbLista.total ? mbFmt(mbLista.total) : ""; conta.title = `${mbFmt(mbLista.total)} ${mbPlural(mbLista.total, "pessoa", "pessoas")} com estes filtros`; }
  if (!itens.length) {
    corpo.innerHTML = `<p class="mb-vazio-lista">${mbLista.busca ? "Ninguém com esse nome, matrícula ou CPF nesta lista." : "Ninguém com esses filtros."}</p>`;
    document.getElementById("mbListaPaginas").innerHTML = "";
    return;
  }
  const situacao = (x) => (mbTem(MB_STATUS_SAIU, String(x.status))
    ? `<span class="mb-chip mb-chip-neutro">${escaparHtmlEbd(MB_STATUS_SAIU[String(x.status)])}</span>`
    : `<span class="${MB_SITUACAO_CHIP[x.situacaoMembro] || "mb-chip mb-chip-neutro"}">${escaparHtmlEbd(MB_SITUACAO[x.situacaoMembro] || "Sem situação")}</span>`);
  const avatar = (x) => (x.fotoUrl
    ? `<span class="mb-avatar"><img src="${urlSegura(x.fotoUrl)}" alt="" loading="lazy" /></span>`
    : `<span class="mb-avatar" aria-hidden="true">${escaparHtmlEbd(mbIniciais(x.nome))}</span>`);
  const dep = (x) => escaparHtmlEbd(mbTextoDoValor("departamentoId", x.departamentoId) || "—");
  corpo.innerHTML = `
    <table class="tabela-simples mb-tabela">
      <thead><tr><th>Nome</th><th>Matrícula</th>${varias ? "<th>Congregação</th>" : ""}<th>Departamento</th><th>Situação</th><th>Cargo</th></tr></thead>
      <tbody>${itens.map((x) => `<tr class="mb-linha-clicavel" data-on-click="mbAbrirFichaAcao" data-args-click="${argsAttr(x.membroId)}">
        <td><button type="button" class="mb-nome-botao">${avatar(x)}<span>${escaparHtmlEbd(x.nome)}</span></button></td>
        <td>${x.membroId}</td>${varias ? `<td>${escaparHtmlEbd(x.congregacao || "—")}</td>` : ""}<td>${dep(x)}</td><td>${situacao(x)}</td><td>${escaparHtmlEbd(x.funcao || "—")}</td></tr>`).join("")}</tbody>
    </table>
    <div class="mb-cartoes-pessoas">${itens.map((x) => `<button type="button" class="mb-cartao-pessoa" data-on-click="mbAbrirFichaAcao" data-args-click="${argsAttr(x.membroId)}">
      ${avatar(x)}<span class="mb-cp-texto"><strong>${escaparHtmlEbd(x.nome)}</strong><span>${x.membroId} · ${varias ? escaparHtmlEbd(x.congregacao || "—") : dep(x)}</span></span>${situacao(x)}</button>`).join("")}</div>`;
  mbDesenharPaginas();
}
function mbJuntarNoCache(cache, itens) {
  const lista = Array.isArray(cache) ? cache.slice() : [];
  for (const p of itens) {
    const i = lista.findIndex((x) => x.membroId === p.membroId);
    if (i >= 0) lista[i] = p; else lista.push(p);
  }
  return lista;
}
function mbDesenharPaginas() {
  const caixa = document.getElementById("mbListaPaginas");
  if (!caixa) return;
  const paginas = Math.max(1, Math.ceil(mbLista.total / MB_POR_PAGINA));
  const atual = Math.min(mbLista.pagina, paginas);
  const de = (atual - 1) * MB_POR_PAGINA + 1;
  const ate = Math.min(mbLista.total, atual * MB_POR_PAGINA);
  const numeros = [];
  for (let n = Math.max(1, atual - 2); n <= Math.min(paginas, atual + 2); n++) numeros.push(n);
  const botao = (n, rotulo, ativo, desligado) => `<button type="button" class="mb-pagina${ativo ? " ativa" : ""}"${desligado ? " disabled" : ""} data-on-click="mbPaginaListaAcao" data-args-click="${argsAttr(n)}"${ativo ? " aria-current=\"page\"" : ""}>${escaparHtmlEbd(rotulo)}</button>`;
  caixa.innerHTML = `<span class="mb-dica">${mbFmt(de)} a ${mbFmt(ate)} de ${mbFmt(mbLista.total)}${mbLista.busca ? ` com “${escaparHtmlEbd(mbLista.busca)}”` : ""} · 20 por página</span>
    ${paginas > 1 ? `<span class="mb-paginas">${botao(atual - 1, "‹", false, atual <= 1)}${numeros.map((n) => botao(n, String(n), n === atual, false)).join("")}${botao(atual + 1, "›", false, atual >= paginas)}</span>` : ""}`;
}

// ================================================================= a FICHA 360
function mbAbrirFicha(membroId, parte) {
  const id = Number(membroId);
  if (!Number.isInteger(id) || id <= 0) return;
  mbFicha = Object.assign(mbFichaVazia(), { membroId: id, parte: parte && MB_PARTES_FICHA.some((p) => p[0] === parte) ? parte : "resumo" });
  // as partes antigas do perfil leem a pessoa destas variáveis (as mesmas que o perfil antigo usava)
  window._membroPerfilAtual = id;
  window._membroFotoAtual = id;
  window._membroHistoricoAtual = id;
  window._membroCasamentosAtual = id;
  window._membroApresentacoesAtual = id;
  window._membroLicencasAtual = id;
  window._membroFamiliaAtual = id;
  mostrarSubAbaPessoas("ficha");
}
// mostrarSubAbaPessoas("ficha") chama esta: o menu principal recolhido no notebook (aprovado na rodada 10) e a ficha desenhada e lida
function mbEntrarNaFicha() {
  const sb = document.getElementById("sidebar");
  const celular = window.matchMedia && window.matchMedia("(max-width: 640px)").matches;
  if (sb && !celular && !sb.classList.contains("recolhido")) { sb.classList.add("recolhido"); mbMenuRecolhidoPelaFicha = true; }
  mbTrazerPartesAntigas();
  mbDesenharFichaMenu();
  document.getElementById("mbFichaCabeca").innerHTML = "<div class=\"mb-cartao mb-ficha-cabeca\"><p class=\"subtitle\">Carregando a ficha…</p></div>";
  document.getElementById("mbFichaCorpo").innerHTML = "";
  mbRecarregarPessoa().then(() => { if (mbFicha.pessoa) mbMostrarParte(); });
}
function mbTrazerPartesAntigas() {
  const destino = document.getElementById("mbFichaAntigas");
  if (!destino || destino.dataset.pronto === "1") return;
  MB_ABAS_ANTIGAS.forEach((n) => { const el = document.getElementById(`tabPerfil${n}`); if (el) destino.appendChild(el); });
  destino.dataset.pronto = "1";
}
// a pessoa da ficha: a mesma linha da lista (o servidor confere o escopo), pela matrícula exata
async function mbRecarregarPessoa() {
  const id = mbFicha.membroId;
  if (!id) return;
  const seq = ++mbFicha.seq;
  let pessoa = null;
  try {
    const res = await fetchProtegido(`${API_BASE}/pessoas?pagina=1&porPagina=1&matricula=${encodeURIComponent(String(id))}`);
    const data = await res.json();
    if (data && data.sucesso && Array.isArray(data.itens)) pessoa = data.itens.find((x) => x.membroId === id) || null;
  } catch (e) { pessoa = null; }
  if (seq !== mbFicha.seq || mbFicha.membroId !== id) return;
  const cabeca = document.getElementById("mbFichaCabeca");
  if (!pessoa) {
    mbFicha.pessoa = null;
    if (cabeca) cabeca.innerHTML = `<div class="mb-cartao mb-ficha-cabeca"><p class="subtitle aviso-recusa">Matrícula não encontrada (ou fora do seu escopo).</p>
      <button type="button" class="btn-link" data-on-click="mostrarSubAbaPessoas" data-args-click="${argsAttr("lista")}">← Voltar à lista</button></div>`;
    document.getElementById("mbFichaCorpo").innerHTML = "";
    return;
  }
  mbFicha.pessoa = pessoa;
  window._pessoasCache = mbJuntarNoCache(window._pessoasCache, [pessoa]);
  document.getElementById("tituloModulo").textContent = `Pessoas — Ficha de ${pessoa.nome}`;
  mbDesenharCabeca();
}
function mbDesenharCabeca() {
  const p = mbFicha.pessoa;
  const cabeca = document.getElementById("mbFichaCabeca");
  if (!p || !cabeca) return;
  const idade = mbIdade(p.dataNascimento);
  const conversao = mbFicha.linha && mbFicha.linha.vidaEspiritual && mbFicha.linha.vidaEspiritual.conversao;
  const anoConversao = conversao && /^(\d{4})/.exec(String(conversao.data || ""));
  const cap = p.capacidade || {};
  const saiu = mbTem(MB_STATUS_SAIU, String(p.status));
  const chips = [
    saiu ? `<span class="mb-chip mb-chip-neutro">${escaparHtmlEbd(MB_STATUS_SAIU[String(p.status)])}</span>`
      : `<span class="${MB_SITUACAO_CHIP[p.situacaoMembro] || "mb-chip mb-chip-neutro"}">${escaparHtmlEbd(MB_SITUACAO[p.situacaoMembro] || "Sem situação")}</span>`,
    p.funcao ? `<span class="mb-chip mb-chip-ouro">${escaparHtmlEbd(p.funcao)}</span>` : "",
    p.departamentoId ? `<span class="mb-chip mb-chip-azul">${escaparHtmlEbd(mbTextoDoValor("departamentoId", p.departamentoId))}</span>` : "",
    !saiu && cap.capacidadeAtiva ? "<span class=\"mb-chip mb-chip-verde-claro\">✓ Vota na assembleia</span>" : "",
    !saiu && cap.emPeriodoIntegracao ? `<span class="mb-chip mb-chip-neutro">Em integração: faltam ${mbFmt(cap.diasRestantesIntegracao)} dias</span>` : "",
    p.menorDeIdade ? "<span class=\"mb-chip mb-chip-neutro\">Menor de idade</span>" : ""
  ].join("");
  const fato = (rotulo, valor) => (valor ? `<span class="mb-fato"><span>${escaparHtmlEbd(rotulo)}</span><strong>${escaparHtmlEbd(valor)}</strong></span>` : "");
  // o motivo de uma saída disciplinar (exclusão, abandono) nunca aparece no cabeçalho: quem tem "disciplina" com a pessoa no escopo vê na linha do tempo (o servidor decide)
  const motivoSaida = p.motivoSaida && !["EXCLUSAO", "ABANDONO_MATERIAL", "ABANDONO_DIGITAL"].includes(p.motivoSaida);
  const foto = p.fotoUrl ? `<img src="${urlSegura(p.fotoUrl)}" alt="Foto de ${escaparHtmlEbd(p.nome)}" />` : `<span aria-hidden="true">${escaparHtmlEbd(mbIniciais(p.nome))}</span>`;
  cabeca.innerHTML = `
    <nav class="mb-trilha" aria-label="Onde você está"><button type="button" class="btn-link" data-on-click="mostrarSubAbaPessoas" data-args-click="${argsAttr("lista")}">← Pessoas</button><span>›</span><span>${escaparHtmlEbd(p.nome)}</span></nav>
    <div class="mb-cartao mb-ficha-cabeca">
      <div class="mb-ficha-foto">${foto}</div>
      <div class="mb-ficha-quem">
        <h3 class="mb-ficha-nome">${escaparHtmlEbd(p.nome)}</h3>
        <p class="mb-sub">Matrícula ${p.membroId} · ${escaparHtmlEbd(p.congregacao ? `Congregação ${p.congregacao}` : "sem congregação")}${p.extensao ? ` · ${escaparHtmlEbd(p.extensao)}` : ""}</p>
        <div class="mb-chips">${chips}</div>
        <div class="mb-fatos">${fato("Idade", idade !== null ? `${idade} anos` : "")}${fato("Membro desde", mbDataBr(p.dataAdmissao))}${fato("Convertido em", anoConversao ? anoConversao[1] : "")}${fato("Celular", mbTelefoneMascarado(p.telefone))}${saiu ? fato("Saída", [mbDataBr(p.dataSaida), motivoSaida ? mbRotuloSaida(p.motivoSaida) : ""].filter(Boolean).join(" · ")) : ""}</div>
      </div>
      <div class="mb-ficha-botoes"><button type="button" class="btn-confirmar mb-btn" data-on-click="mbFichaParteAcao" data-args-click="${argsAttr("dados")}">✏️ Editar</button></div>
    </div>`;
}
const MB_ROTULO_SAIDA = { FALECIMENTO: "falecimento", DESLIGAMENTO: "desligamento", CARTA_MUDANCA: "carta de mudança", EXCLUSAO: "exclusão", ABANDONO_MATERIAL: "abandono", ABANDONO_DIGITAL: "abandono digital" };
function mbRotuloSaida(motivo) { return mbTem(MB_ROTULO_SAIDA, String(motivo)) ? MB_ROTULO_SAIDA[String(motivo)] : "outro motivo"; }
function mbDesenharFichaMenu() {
  const menu = document.getElementById("mbFichaMenu");
  if (!menu) return;
  const p = mbFicha.pessoa;
  const podeDesligar = p && !mbTem(MB_STATUS_SAIU, String(p.status));
  menu.innerHTML = `<p class="mb-ficha-menu-rotulo">Nesta ficha</p>
    ${MB_PARTES_FICHA.map(([chave, icone, rotulo]) => `<button type="button" class="mb-ficha-menu-item${chave === mbFicha.parte ? " ativo" : ""}" data-on-click="mbFichaParteAcao" data-args-click="${argsAttr(chave)}"${chave === mbFicha.parte ? " aria-current=\"page\"" : ""}><span aria-hidden="true">${escaparHtmlEbd(icone)}</span>${escaparHtmlEbd(rotulo)}</button>`).join("")}
    ${podeDesligar ? "<button type=\"button\" class=\"mb-ficha-menu-item mb-perigo\" data-on-click=\"mbDesligarAcao\"><span aria-hidden=\"true\">🚫</span>Desligar do rol</button>" : ""}
    <p class="mb-dica mb-ficha-menu-nota">Parte nova entra aqui embaixo: o menu cresce para baixo, nunca para o lado.</p>`;
}
function mbMostrarParte() {
  mbDesenharFichaMenu();
  const corpo = document.getElementById("mbFichaCorpo");
  const antigas = document.getElementById("mbFichaAntigas");
  const parte = mbFicha.parte;
  if (mbTem(MB_PARTE_ANTIGA, parte)) {
    corpo.innerHTML = "";
    antigas.style.display = "block";
    const item = MB_PARTES_FICHA.find((p) => p[0] === parte);
    const titulo = document.getElementById("mbFichaAntigasTitulo");
    if (titulo && item) titulo.textContent = `${item[1]} ${item[2]}`;
    mostrarAbaPerfil(MB_PARTE_ANTIGA[parte]);
    return;
  }
  antigas.style.display = "none";
  if (parte === "dados") { mbMostrarDados(); return; }
  if (parte === "alteracoes") { mbMostrarAlteracoes(); return; }
  mbMostrarResumo();
}

// ---- Resumo: a linha do tempo (todos veem), a vida espiritual e os dados pessoais ----
async function mbMostrarResumo() {
  const corpo = document.getElementById("mbFichaCorpo");
  const id = mbFicha.membroId;
  if (!mbFicha.linha) {
    corpo.innerHTML = "<div class=\"mb-cartao\"><p class=\"subtitle\">Carregando a linha do tempo…</p></div>";
    try {
      const res = await fetchProtegido(`${API_BASE}/pessoas/${encodeURIComponent(String(id))}/linha-do-tempo?pagina=${mbFicha.linhaPagina}&porPagina=8`);
      const data = await jsonDaTela(res, corpo);
      if (mbFicha.membroId !== id || mbFicha.parte !== "resumo") return;
      if (!data) return;
      mbFicha.linha = data;
      mbDesenharCabeca();
    } catch (e) {
      corpo.innerHTML = "<p class=\"subtitle aviso-recusa\">⚠️ Não deu para ler a linha do tempo agora.</p>";
      return;
    }
  }
  if (!mbFicha.campos) await mbLerCampos(id);
  if (mbFicha.membroId !== id || mbFicha.parte !== "resumo") return;
  corpo.innerHTML = mbResumoHtml();
}
function mbResumoHtml() {
  const l = mbFicha.linha || {};
  const eventos = Array.isArray(l.eventos) ? l.eventos : [];
  const total = mbNum(l.total);
  const paginas = Math.max(1, Math.ceil(total / 8));
  const ve = l.vidaEspiritual || {};
  const quando = (d, aproximada) => (aproximada ? `por volta de ${escaparHtmlEbd(String(d || "").slice(0, 4))}` : escaparHtmlEbd(mbDataBr(d)));
  const itens = eventos.map((e) => `<li class="mb-tempo-item mb-tempo-${escaparHtmlEbd(String(e.categoria || "").toLowerCase())}">
      <span class="mb-tempo-icone" aria-hidden="true">${escaparHtmlEbd(MB_ICONE_CATEGORIA[e.categoria] || "•")}</span>
      <span class="mb-tempo-texto"><strong>${escaparHtmlEbd(e.titulo)}</strong> <span class="mb-tempo-data">${quando(e.data, e.aproximada)}</span>${e.detalhe ? `<span class="mb-tempo-detalhe">${escaparHtmlEbd(e.detalhe)}</span>` : ""}</span></li>`).join("");
  const linhaVE = (rotulo, valor) => `<div class="mb-campo"><span class="mb-campo-rotulo">${escaparHtmlEbd(rotulo)}</span><span class="mb-campo-valor">${valor || "<em class=\"mb-vazio\">não informado</em>"}</span></div>`;
  const conv = ve.conversao ? [quando(ve.conversao.data, ve.conversao.aproximada), ve.conversao.detalhe ? escaparHtmlEbd(ve.conversao.detalhe) : ""].filter(Boolean).join(" · ") : "";
  const aguas = ve.batismoAguas ? [quando(ve.batismoAguas.data, false), ve.batismoAguas.local ? escaparHtmlEbd(ve.batismoAguas.local) : "", ve.batismoAguas.emOutraIgreja ? `em outra igreja: ${escaparHtmlEbd(ve.batismoAguas.emOutraIgreja)}` : ""].filter(Boolean).join(" · ") : "";
  const espirito = ve.batismoEspiritoSanto ? [quando(ve.batismoEspiritoSanto.data, ve.batismoEspiritoSanto.aproximada), ve.batismoEspiritoSanto.detalhe ? escaparHtmlEbd(ve.batismoEspiritoSanto.detalhe) : ""].filter(Boolean).join(" · ") : "";
  const proc = ve.procedencia ? [ve.procedencia.formaAdmissao ? `entrou ${escaparHtmlEbd(ve.procedencia.formaAdmissao)}` : "", ve.procedencia.dataAdmissao ? escaparHtmlEbd(mbDataBr(ve.procedencia.dataAdmissao)) : "", ve.procedencia.igrejaAnterior ? escaparHtmlEbd(ve.procedencia.igrejaAnterior) : "", ve.procedencia.origem ? escaparHtmlEbd(ve.procedencia.origem) : ""].filter(Boolean).join(" · ") : "";
  const campo = (chave) => ((mbFicha.campos && mbFicha.campos.campos) || []).find((c) => c.chave === chave) || null;
  const p = mbFicha.pessoa || {};
  const idade = mbIdade(p.dataNascimento);
  const cpf = campo("cpf");
  return `<div class="mb-resumo">
    <section class="mb-cartao mb-tempo">
      <header class="mb-cartao-cabeca"><h4>Vida na Igreja</h4><span class="mb-dica">todos veem · mais recente primeiro</span></header>
      ${itens ? `<ol class="mb-tempo-lista">${itens}</ol>` : "<p class=\"subtitle\">Nada registrado ainda.</p>"}
      ${paginas > 1 ? `<div class="mb-paginacao"><span class="mb-dica">${mbFmt(total)} ${mbPlural(total, "acontecimento", "acontecimentos")}</span><span class="mb-paginas">
        <button type="button" class="mb-pagina"${mbFicha.linhaPagina <= 1 ? " disabled" : ""} data-on-click="mbLinhaPaginaAcao" data-args-click="${argsAttr(mbFicha.linhaPagina - 1)}">‹ Mais recentes</button>
        <button type="button" class="mb-pagina"${mbFicha.linhaPagina >= paginas ? " disabled" : ""} data-on-click="mbLinhaPaginaAcao" data-args-click="${argsAttr(mbFicha.linhaPagina + 1)}">Mais antigos ›</button></span></div>` : ""}
    </section>
    <div class="mb-resumo-lado">
      <section class="mb-cartao"><header class="mb-cartao-cabeca"><h4>🕊️ Vida espiritual</h4></header>
        ${linhaVE("Conversão", conv)}${linhaVE("Batismo nas águas", aguas)}${linhaVE("Batismo no Espírito Santo", espirito)}${linhaVE("Procedência", proc)}
      </section>
      <section class="mb-cartao"><header class="mb-cartao-cabeca"><h4>👤 Dados pessoais</h4><button type="button" class="btn-link" data-on-click="mbFichaParteAcao" data-args-click="${argsAttr("dados")}">Ver e mudar ›</button></header>
        ${linhaVE("Nascimento", p.dataNascimento ? `${escaparHtmlEbd(mbDataBr(p.dataNascimento))}${idade !== null ? ` · ${idade} anos` : ""}` : "")}
        ${linhaVE("CPF", cpf && cpf.valor ? mbCpfHtml(cpf.valor) : "")}
        ${linhaVE("Estado civil", escaparHtmlEbd(mbTextoDoValor("estadoCivil", p.estadoCivil)))}
        ${linhaVE("Escolaridade", escaparHtmlEbd(mbTextoDoValor("escolaridade", p.escolaridade)))}
      </section>
    </div>
  </div>`;
}
// o CPF: mascarado para todos; a Secretaria Geral pode "Mostrar" (o servidor registra cada leitura)
function mbCpfHtml(mascarado) {
  if (mbFicha.cpfInteiro) return `<span class="mb-cpf">${escaparHtmlEbd(mbFicha.cpfInteiro)}</span> <span class="mb-dica">(a leitura ficou registrada)</span>`;
  return `<span class="mb-cpf">${escaparHtmlEbd(mascarado)}</span> ${mbEhGeral()
    ? "<button type=\"button\" class=\"btn-link\" data-on-click=\"mbMostrarCpfAcao\">Mostrar</button>"
    : "<span class=\"mb-dica\">(só a Secretaria Geral vê inteiro)</span>"}`;
}
async function mbMostrarCpfAcao() {
  const id = mbFicha.membroId;
  if (!id || !mbEhGeral()) return;
  try {
    const res = await fetchProtegido(`${API_BASE}/pessoas/${encodeURIComponent(String(id))}?ver=cpf`);
    const data = await res.json();
    if (mbFicha.membroId !== id) return;
    if (!data || !data.sucesso) { mostrarToast((data && data.mensagem) || "Não deu para mostrar o CPF.", "erro"); return; }
    mbFicha.cpfInteiro = data.cpf || null;
    if (!mbFicha.cpfInteiro) { mostrarToast("Esta ficha ainda não tem CPF.", "erro"); return; }
    mbMostrarParte();
  } catch (e) { mostrarToast("Não deu para mostrar o CPF agora.", "erro"); }
}

// ---- Dados pessoais: CAMPO A CAMPO (cada mudança é um campo só, com "quem mudou o quê" na trilha) ----
async function mbLerCampos(id) {
  try {
    const res = await fetchProtegido(`${API_BASE}/pessoas/${encodeURIComponent(String(id))}/ficha/campos`);
    const data = await res.json();
    if (mbFicha.membroId !== id) return;
    mbFicha.campos = data && data.sucesso ? data : { campos: [], erro: (data && data.mensagem) || "Não deu para ler a ficha." };
  } catch (e) {
    if (mbFicha.membroId === id) mbFicha.campos = { campos: [], erro: "Não deu para ler a ficha agora." };
  }
}
async function mbMostrarDados() {
  const corpo = document.getElementById("mbFichaCorpo");
  const id = mbFicha.membroId;
  if (!mbFicha.campos) {
    corpo.innerHTML = "<div class=\"mb-cartao\"><p class=\"subtitle\">Carregando os dados…</p></div>";
    await mbLerCampos(id);
    if (mbFicha.membroId !== id || mbFicha.parte !== "dados") return;
  }
  if (typeof carregarOpcoesFormPessoa === "function" && !(window._departamentosCache || []).length) carregarOpcoesFormPessoa();
  corpo.innerHTML = mbDadosHtml();
  const entrada = document.getElementById("mbCampoValor");
  if (entrada) entrada.focus();
}
function mbDadosHtml() {
  const f = mbFicha.campos || {};
  if (f.erro) return `<div class="mb-cartao"><p class="subtitle aviso-recusa">⚠️ ${escaparHtmlEbd(f.erro)}</p></div>`;
  const campos = Array.isArray(f.campos) ? f.campos : [];
  const cartoes = MB_GRUPOS_FICHA.map((g) => {
    const doGrupo = campos.filter((c) => c.grupo === g);
    if (!doGrupo.length) return "";
    return `<section class="mb-cartao"><header class="mb-cartao-cabeca"><h4>${escaparHtmlEbd(g)}</h4></header>${doGrupo.map(mbLinhaCampoHtml).join("")}</section>`;
  }).join("");
  const aviso = f.emProcessoDeCargo ? "<p class=\"mb-faixa-aviso\">Esta pessoa tem um processo de cargo em andamento: nascimento, admissão e estado civil só a Secretaria Geral muda até ele terminar.</p>" : "";
  return `${aviso}<div class="mb-dados-grade">${cartoes}</div>${mbQuemMudaHtml(f.quemMudaOQue)}`;
}
function mbLinhaCampoHtml(c) {
  const texto = mbTextoDoValor(c.chave, c.valor);
  const erro = mbFicha.erroCampo && mbFicha.erroCampo.chave === c.chave ? mbFicha.erroCampo : null;
  const erroHtml = erro ? `<p class="mb-campo-erro" role="alert">⚠️ ${escaparHtmlEbd(erro.mensagem)}${erro.matricula ? ` <button type="button" class="btn-link" data-on-click="mbAbrirFichaAcao" data-args-click="${argsAttr(erro.matricula)}">Abrir a ficha ${mbNum(erro.matricula)} ›</button>` : ""}</p>` : "";
  if (mbFicha.editando === c.chave) {
    return `<form class="mb-campo-editando" data-on-submit="mbSalvarCampoAcao" data-prevent="submit" data-args-submit="${argsAttr(c.chave)}">
      <label class="mb-campo-rotulo" for="mbCampoValor">${escaparHtmlEbd(c.rotulo)}</label>
      <span class="mb-campo-linha">${mbEntradaDoCampo(c)}<button type="submit" class="btn-confirmar mb-btn-pequeno">Salvar</button><button type="button" class="btn-link" data-on-click="mbCancelarCampoAcao">Cancelar</button></span>
      ${erroHtml}</form>`;
  }
  let valorHtml = texto ? escaparHtmlEbd(texto) : "<em class=\"mb-vazio\">não informado</em>";
  if (c.chave === "cpf" && c.valor) valorHtml = mbCpfHtml(c.valor);
  // o motivo de não poder mudar fica embaixo do valor (a coluna da ação é estreita: só o "Mudar")
  const trava = c.pode ? "" : `<span class="mb-trava">🔒 ${escaparHtmlEbd(c.motivo || "Você não muda este dado.")}</span>`;
  let acao = "";
  if (c.pode && c.tipo === "endereco") acao = `<button type="button" class="btn-link" title="O endereço muda no cadastro completo" data-on-click="mbFichaParteAcao" data-args-click="${argsAttr("cadastro")}">Mudar ›</button>`;
  else if (c.pode) acao = `<button type="button" class="btn-link" data-on-click="mbEditarCampoAcao" data-args-click="${argsAttr(c.chave)}">Mudar</button>`;
  return `<div class="mb-campo"><span class="mb-campo-rotulo">${escaparHtmlEbd(c.rotulo)}</span><span class="mb-campo-valor"><span>${valorHtml}</span>${trava}</span><span class="mb-campo-acao">${acao}</span>${erroHtml}</div>`;
}
function mbEntradaDoCampo(c) {
  const v = c.valor === null || c.valor === undefined ? "" : String(c.valor);
  if (c.tipo === "data") return `<input type="date" id="mbCampoValor" value="${escaparHtmlEbd(v)}" />`;
  if (c.tipo === "lista") {
    const opcoes = (Array.isArray(c.opcoes) ? c.opcoes : []).map((o) => `<option value="${escaparHtmlEbd(o)}"${String(o) === v ? " selected" : ""}>${escaparHtmlEbd(mbTextoDoValor(c.chave, o))}</option>`).join("");
    return `<select id="mbCampoValor"><option value="">— não informado —</option>${opcoes}</select>`;
  }
  if (c.tipo === "departamento") {
    const deps = (window._departamentosCache || []).filter((d) => d.ativo !== false || String(d.departamentoId) === v);
    return `<select id="mbCampoValor"><option value="">— sem departamento —</option>${deps.map((d) => `<option value="${d.departamentoId}"${String(d.departamentoId) === v ? " selected" : ""}>${escaparHtmlEbd(d.nome)}</option>`).join("")}</select>`;
  }
  if (c.tipo === "telefone") return `<input type="tel" id="mbCampoValor" inputmode="tel" maxlength="20" value="${escaparHtmlEbd(v)}" placeholder="(91) 90000-0000" />`;
  if (c.tipo === "email") return `<input type="email" id="mbCampoValor" maxlength="150" value="${escaparHtmlEbd(v)}" />`;
  if (c.tipo === "cpf") return "<input type=\"text\" id=\"mbCampoValor\" inputmode=\"numeric\" maxlength=\"14\" value=\"\" placeholder=\"000.000.000-00\" />";
  return `<input type="text" id="mbCampoValor" maxlength="200" value="${escaparHtmlEbd(v)}" />`;
}
function mbQuemMudaHtml(tabela) {
  const linhas = Array.isArray(tabela) ? tabela : [];
  if (!linhas.length) return "";
  const t = (x) => escaparHtmlEbd(mbTem(MB_QUEM_MUDA, String(x)) ? MB_QUEM_MUDA[String(x)] : "—");
  return `<details class="mb-cartao mb-quem-muda"${mbFicha.quemMudaAberto ? " open" : ""}><summary>Quem pode mudar cada dado</summary>
    <table class="tabela-simples"><thead><tr><th>Dado</th><th>Secretaria Geral</th><th>Secretaria local</th><th>O próprio membro</th></tr></thead>
    <tbody>${linhas.map((l) => `<tr><td>${escaparHtmlEbd(l.rotulo)}</td><td>${t(l.geral)}</td><td>${t(l.secretaria)}</td><td>${t(l.membro)}</td></tr>`).join("")}</tbody></table>
    <p class="mb-dica">Endereço e departamento também mudam no cadastro completo. A congregação muda pela transferência; o cargo, pela esteira de consagração.</p></details>`;
}
function mbEditarCampoAcao(chave) {
  mbFicha.editando = chave;
  mbFicha.erroCampo = null;
  mbMostrarDados();
}
function mbCancelarCampoAcao() {
  mbFicha.editando = null;
  mbFicha.erroCampo = null;
  mbMostrarDados();
}
async function mbSalvarCampoAcao(chave) {
  const campos = (mbFicha.campos && mbFicha.campos.campos) || [];
  const c = campos.find((x) => x.chave === chave);
  const el = document.getElementById("mbCampoValor");
  const id = mbFicha.membroId;
  if (!c || !el || !id) return;
  const valor = String(el.value || "").trim();
  let res = null, data = null;
  try {
    res = await fetchProtegido(`${API_BASE}/pessoas/${encodeURIComponent(String(id))}/ficha/campo`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ campo: chave, valor, valorLido: c.valor === undefined ? null : c.valor })
    });
    data = await res.json();
  } catch (e) { data = null; }
  if (mbFicha.membroId !== id) return;
  if (!data) { mostrarToast("Não deu para salvar agora. Confira a internet e tente de novo.", "erro"); return; }
  if (data.sucesso) {
    c.valor = data.valor === undefined ? valor : data.valor;
    mbFicha.editando = null;
    mbFicha.erroCampo = null;
    mbFicha.alteracoes = null;
    mbFicha.linha = null;
    if (chave === "cpf") mbFicha.cpfInteiro = null;
    mostrarToast(data.mensagem || "Salvo.", "sucesso");
    mbMostrarDados();
    mbRecarregarPessoa();
    return;
  }
  if (res && res.status === 409) {
    // alguém mudou este dado enquanto a tela estava aberta: relê a ficha (nunca grava por cima)
    mostrarToast(data.mensagem || "Esta ficha mudou. Veja o valor de agora.", "erro");
    mbFicha.campos = null;
    mbFicha.editando = null;
    mbMostrarDados();
    return;
  }
  mbFicha.erroCampo = { chave, mensagem: data.mensagem || "Não deu para salvar.", matricula: data.matricula ? mbNum(data.matricula) : null };
  mbMostrarDados();
}

// ---- Alterações: quem mudou o quê, e quando (lido da trilha; CPF, e-mail e telefone chegam mascarados) ----
async function mbMostrarAlteracoes() {
  const corpo = document.getElementById("mbFichaCorpo");
  const id = mbFicha.membroId;
  if (!mbFicha.alteracoes) {
    corpo.innerHTML = "<div class=\"mb-cartao\"><p class=\"subtitle\">Carregando as alterações…</p></div>";
    try {
      const res = await fetchProtegido(`${API_BASE}/pessoas/${encodeURIComponent(String(id))}/ficha/alteracoes?pagina=${mbFicha.altPagina}&porPagina=12`);
      const data = await jsonDaTela(res, corpo);
      if (mbFicha.membroId !== id || mbFicha.parte !== "alteracoes" || !data) return;
      mbFicha.alteracoes = data;
    } catch (e) {
      corpo.innerHTML = "<p class=\"subtitle aviso-recusa\">⚠️ Não deu para ler as alterações agora.</p>";
      return;
    }
  }
  const a = mbFicha.alteracoes;
  const itens = Array.isArray(a.itens) ? a.itens : [];
  const total = mbNum(a.total);
  const paginas = Math.max(1, Math.ceil(total / 12));
  const quando = (iso) => {
    const d = new Date(String(iso || ""));
    return Number.isNaN(d.getTime()) ? "" : d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
  };
  const valor = (m, k) => {
    const t = mbTextoDoValor(m.campo, m[k]);
    return t ? escaparHtmlEbd(t) : "<em class=\"mb-vazio\">vazio</em>";
  };
  const linhas = itens.map((i) => `<li class="mb-alteracao">
      <div class="mb-alteracao-quem"><strong>${escaparHtmlEbd(i.quem ? i.quem.nome || `Matrícula ${mbNum(i.quem.matricula)}` : "O sistema")}</strong>
        <span class="mb-dica">${escaparHtmlEbd(quando(i.quando))}${i.acao ? ` · ${escaparHtmlEbd(i.acao)}` : ""}</span></div>
      <ul class="mb-mudancas">${(Array.isArray(i.mudancas) ? i.mudancas : []).map((m) => `<li><span class="mb-mudanca-campo">${escaparHtmlEbd(mbRotuloDaChave(m.campo, m.rotulo))}:</span>
        ${mbTem(m, "antes") ? `${valor(m, "antes")} <span aria-hidden="true">→</span> ` : ""}${valor(m, "depois")}</li>`).join("") || "<li class=\"mb-dica\">sem detalhe do que mudou</li>"}</ul></li>`).join("");
  corpo.innerHTML = `<section class="mb-cartao">
    <header class="mb-cartao-cabeca"><h4>🕒 Alterações nesta ficha</h4><span class="mb-dica">quem mudou o quê, mais recente primeiro</span></header>
    ${linhas ? `<ol class="mb-alteracoes">${linhas}</ol>` : "<p class=\"subtitle\">Nenhuma alteração registrada ainda.</p>"}
    ${paginas > 1 ? `<div class="mb-paginacao"><span class="mb-dica">${mbFmt(total)} ${mbPlural(total, "alteração", "alterações")}</span><span class="mb-paginas">
      <button type="button" class="mb-pagina"${mbFicha.altPagina <= 1 ? " disabled" : ""} data-on-click="mbAlteracoesPaginaAcao" data-args-click="${argsAttr(mbFicha.altPagina - 1)}">‹ Mais recentes</button>
      <button type="button" class="mb-pagina"${mbFicha.altPagina >= paginas ? " disabled" : ""} data-on-click="mbAlteracoesPaginaAcao" data-args-click="${argsAttr(mbFicha.altPagina + 1)}">Mais antigas ›</button></span></div>` : ""}
  </section>`;
}

// ================================================================= as ações (o HTML pede pelo nome; app/eventos.js chama só as registradas)
function mbEscolherCongregacaoAcao(onde, valor) {
  const id = String(valor || "").replace(/\D/g, "");
  if (onde === "lista") { mbLista.congregacaoId = id; mbLista.pagina = 1; mbCarregarLista(); return; }
  mbPainel.congregacaoId = id;
  mbCarregarPainel();
}
function mbAjustarGraficoAcao(qual, valor) {
  if (qual === "padrao") mbAjuste = { recorte: "es", agrupar: "departamento", modo: "qtd" };
  else if (qual === "recorte" && mbTem(MB_RECORTES, String(valor))) mbAjuste.recorte = String(valor);
  else if (qual === "agrupar" && mbTem(MB_AGRUPAR, String(valor))) mbAjuste.agrupar = String(valor);
  else if (qual === "modo") mbAjuste.modo = valor === "pct" ? "pct" : "qtd";
  try { localStorage.setItem(MB_CHAVE_AJUSTE, JSON.stringify(mbAjuste)); } catch (e) { /* vale só nesta visita */ }
  const el = document.getElementById("mbGraficoGrande");
  if (el) el.innerHTML = mbGraficoGrandeHtml();
}
function mbAlternarAjusteAcao() {
  mbPainel.ajusteAberto = !mbPainel.ajusteAberto;
  const el = document.getElementById("mbGraficoGrande");
  if (el) el.innerHTML = mbGraficoGrandeHtml();
}
function mbAvisosFiltroAcao(soResolver) {
  mbPainel.soResolver = soResolver === true;
  const el = document.getElementById("mbAvisos");
  if (el) el.innerHTML = mbAvisosHtml();
}
function mbAbrirListaFiltradaAcao(falta) {
  mbLista = Object.assign(mbLista, { pagina: 1, busca: "", situacao: "", departamentoId: "", falta: mbTem(MB_FALTAS, String(falta)) ? String(falta) : "", rol: "1", congregacaoId: mbPainel.congregacaoId || "" });
  mostrarSubAbaPessoas("lista");
}
function mbAbrirListaSituacaoAcao(situacao) {
  mbLista = Object.assign(mbLista, { pagina: 1, busca: "", situacao: mbTem(MB_SITUACAO, String(situacao)) ? String(situacao) : "", departamentoId: "", falta: "", rol: "1", congregacaoId: mbPainel.congregacaoId || "" });
  mostrarSubAbaPessoas("lista");
}
function mbBuscaListaAcao(valor) {
  mbLista.busca = String(valor || "").trim().slice(0, 100);
  mbLista.pagina = 1;
  if (mbLista.espera) clearTimeout(mbLista.espera);
  mbLista.espera = setTimeout(() => { mbLista.espera = null; mbCarregarLista(); }, 300);
}
function mbFiltroListaAcao(qual, valor) {
  const v = String(valor || "");
  if (qual === "situacao") mbLista.situacao = mbTem(MB_SITUACAO, v) ? v : "";
  if (qual === "departamentoId") mbLista.departamentoId = v.replace(/\D/g, "");
  if (qual === "falta") mbLista.falta = mbTem(MB_FALTAS, v) ? v : "";
  if (qual === "rol") mbLista.rol = mbTem(MB_ROL, v) ? v : "1";
  mbLista.pagina = 1;
  mbDesenharListaMoldura();
  mbCarregarLista();
}
function mbLimparFiltrosListaAcao() {
  mbLista = Object.assign(mbLista, { pagina: 1, busca: "", congregacaoId: "", situacao: "", departamentoId: "", falta: "", rol: "1" });
  mbDesenharListaMoldura();
  mbCarregarLista();
}
function mbPaginaListaAcao(pagina) {
  const n = Number(pagina);
  if (!Number.isInteger(n) || n < 1) return;
  mbLista.pagina = n;
  mbCarregarLista();
  const lista = document.getElementById("subPessoasLista");
  if (lista && lista.scrollIntoView) lista.scrollIntoView({ block: "start", behavior: "smooth" });
}
function mbAbrirFichaAcao(membroId) { mbAbrirFicha(membroId, "resumo"); }
function mbFichaParteAcao(parte) {
  if (!MB_PARTES_FICHA.some((p) => p[0] === parte)) return;
  mbFicha.parte = parte;
  mbFicha.editando = null;
  mbFicha.erroCampo = null;
  if (mbFicha.pessoa) mbMostrarParte();
  const corpo = document.getElementById("mbFichaCorpo");
  if (corpo && window.matchMedia && window.matchMedia("(max-width: 640px)").matches && corpo.scrollIntoView) corpo.scrollIntoView({ block: "nearest" });
}
function mbLinhaPaginaAcao(pagina) {
  const n = Number(pagina);
  if (!Number.isInteger(n) || n < 1) return;
  mbFicha.linhaPagina = n;
  mbFicha.linha = null;
  mbMostrarResumo();
}
function mbAlteracoesPaginaAcao(pagina) {
  const n = Number(pagina);
  if (!Number.isInteger(n) || n < 1) return;
  mbFicha.altPagina = n;
  mbFicha.alteracoes = null;
  mbMostrarAlteracoes();
}
async function mbDesligarAcao() {
  const id = mbFicha.membroId;
  if (!id || typeof desligarPessoa !== "function") return;
  const ok = await desligarPessoa(id);
  if (ok && mbFicha.membroId === id) { mbFicha.linha = null; mbFicha.campos = null; mbFicha.alteracoes = null; await mbRecarregarPessoa(); mbMostrarParte(); }
}

registrarAcoes({
  mbAbrirFichaAcao, mbAbrirListaFiltradaAcao, mbAbrirListaSituacaoAcao, mbAjustarGraficoAcao, mbAlteracoesPaginaAcao, mbAlternarAjusteAcao, mbAvisosFiltroAcao,
  mbBuscaListaAcao, mbCancelarCampoAcao, mbDesligarAcao, mbEditarCampoAcao, mbEscolherCongregacaoAcao, mbFichaParteAcao, mbFiltroListaAcao,
  mbLimparFiltrosListaAcao, mbLinhaPaginaAcao, mbMostrarCpfAcao, mbPaginaListaAcao, mbSalvarCampoAcao
});
