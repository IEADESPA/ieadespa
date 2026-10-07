// app/modulos/financeiro.js — módulo extraído do script.js (vD.2, 2026-10-07).
// Script clássico, carregado pelo index.html DEPOIS do script.js e do eventos.js: compartilha o escopo
// global com eles (as funções e constantes abaixo continuam acessíveis pelo nome, como antes). As ações
// que o HTML pede deste módulo são registradas aqui mesmo, no fim do arquivo (registrarAcoes mescla).

// ---- FINANCEIRO (v4.1) — Tesouraria Local e Repasses ----
const SUB_ABAS_FINANCEIRO = ["visaogeral", "situacaotesouro", "lancamentos", "planocontas", "campanhas", "saidas", "receber", "orcamento", "pdq", "demonstracoes", "rateiogeral", "prebenda", "patrimonio", "frota", "conciliacao", "investimentos", "repasses", "seguros", "parametrosmonetarios", "cessoes", "obrigacoes", "imunidade", "receitasacessorias", "imoveis", "obras", "dizimistas", "fechamento", "relatorio", "parametros", "consolidado"];
const TITULOS_SUB_FINANCEIRO = {
  visaogeral: "Visão Geral", situacaotesouro: "Situação do Tesouro", lancamentos: "Lançamentos", planocontas: "Plano de Contas", campanhas: "Campanhas", saidas: "Saídas", receber: "Contas a Receber", orcamento: "Orçamento", pdq: "PDQ", demonstracoes: "Demonstrações Contábeis", rateiogeral: "Rateio Geral", prebenda: "Prebenda", patrimonio: "Patrimônio", frota: "Frota", conciliacao: "Conciliação Bancária", investimentos: "Investimentos", repasses: "Repasses Institucionais", seguros: "Seguros Institucionais", parametrosmonetarios: "Parâmetros Monetários", cessoes: "Cessão de Templo", obrigacoes: "Obrigações Fiscais", imunidade: "Imunidade Tributária",
  receitasacessorias: "Receitas Acessórias", imoveis: "Imóveis (Situação Fiscal)", obras: "Obras",
  dizimistas: "Dizimistas do Mês", fechamento: "Fechamento do Mês", relatorio: "Relatório", parametros: "Parâmetros", consolidado: "Consolidado"
};
let subAbaFinanceiroAtual = "visaogeral";
let _congregacoesFinanceiroCache = null;
let _categoriasEntradaCache = null;

// v4.1.6 — sub-módulos do Financeiro (pedido explícito: quem clica em
// Financeiro precisa saber logo de cara o que está procurando, não cair
// direto num formulário de cadastrar dízimo). Hoje só "Entradas" existe de
// verdade (v4.1-v4.1.5); os demais refletem o roadmap da FASE 4 (README)
// e aparecem como "em breve" — crescer aqui é só adicionar uma entrada
// neste array, mesmo espírito do objeto MODULOS do painel principal.
const SUBMODULOS_FINANCEIRO = [
  { chave: "entradas", titulo: "Entradas", icone: "📝", subAba: "lancamentos", pronto: true },
  { chave: "planocontas", titulo: "Plano de Contas", icone: "📚", subAba: "planocontas", pronto: true },
  { chave: "campanhas", titulo: "Campanhas", icone: "🎯", subAba: "campanhas", pronto: true },
  { chave: "saidas", titulo: "Saídas (Contas a Pagar)", icone: "💸", subAba: "saidas", pronto: true },
  { chave: "receber", titulo: "Contas a Receber", icone: "📆", subAba: "receber", pronto: true },
  { chave: "orcamento", titulo: "Orçamento e Planejamento", icone: "📐", subAba: "orcamento", pronto: true },
  { chave: "pdq", titulo: "PDQ (Planejamento Diretor Quadrienal)", icone: "🧭", subAba: "pdq", pronto: true },
  { chave: "demonstracoes", titulo: "Demonstrações Contábeis (ITG 2002)", icone: "📑", subAba: "demonstracoes", pronto: true },
  { chave: "patrimonio", titulo: "Patrimônio, Alçadas e Depreciação", icone: "🏛️", subAba: "patrimonio", pronto: true },
  { chave: "doacoes", titulo: "Doações Online", icone: "💳", pronto: false },
  { chave: "auditoria", titulo: "Auditoria e Compliance", icone: "🕵️", pronto: false }
];

// Sub-abas do Financeiro que o servidor agora entrega SÓ ao nível geral (papel Global com escopo de todas as congregações): para os demais tesoureiros nem aparecem.
const SUB_ABAS_FINANCEIRO_SO_GERAL = ["situacaotesouro", "orcamento", "demonstracoes", "rateiogeral", "prebenda", "conciliacao", "investimentos", "repasses", "seguros", "parametrosmonetarios", "obrigacoes", "imunidade"];
function subAbaFinanceiraPermitida(nome) {
  return authGeral || !SUB_ABAS_FINANCEIRO_SO_GERAL.includes(nome);
}
function aplicarSubAbasFinanceiro() {
  SUB_ABAS_FINANCEIRO_SO_GERAL.forEach(nome => {
    const botao = document.getElementById(`btnSubFinanceiro${capitalize(nome)}`);
    if (botao) botao.style.display = subAbaFinanceiraPermitida(nome) ? "" : "none";
  });
}

function montarGradeSubmodulosFinanceiro() {
  const grade = document.getElementById("gradeSubmodulosFinanceiro");
  grade.innerHTML = SUBMODULOS_FINANCEIRO.filter(m => !m.pronto || subAbaFinanceiraPermitida(m.subAba)).map(m => {
    if (!m.pronto) {
      return `<div class="card-modulo card-modulo-embreve" title="Ainda não construído — ver plano da FASE 4 no README">
        <span class="icone-modulo">${escaparHtmlEbd(m.icone)}</span><span>${escaparHtmlEbd(m.titulo)}</span><span class="tag-pendente">Em breve</span>
      </div>`;
    }
    return `<div class="card-modulo" data-on-click="mostrarSubAbaFinanceiro" data-args-click="${argsAttr(String(m.subAba ?? ""))}" tabindex="0" role="button" data-on-keydown="ativarComTeclado" data-args-keydown="${argsAttr(ARG.evento, ARG.elemento)}">
      <span class="icone-modulo">${escaparHtmlEbd(m.icone)}</span><span>${escaparHtmlEbd(m.titulo)}</span>
    </div>`;
  }).join("");
}

function mostrarSubAbaFinanceiro(sub) {
  if (!subAbaFinanceiraPermitida(sub)) sub = "visaogeral";
  aplicarSubAbasFinanceiro();
  subAbaFinanceiroAtual = sub;
  chaveAjudaAtual = `financeiro:${sub}`;
  SUB_ABAS_FINANCEIRO.forEach(nome => {
    document.getElementById(`subFinanceiro${capitalize(nome)}`).style.display = nome === sub ? "block" : "none";
    document.getElementById(`btnSubFinanceiro${capitalize(nome)}`).classList.toggle("ativo", nome === sub);
  });
  document.getElementById("tituloModulo").textContent = `Financeiro — ${TITULOS_SUB_FINANCEIRO[sub]}`;
  if (sub === "visaogeral") { montarGradeSubmodulosFinanceiro(); return; }
  if (sub === "situacaotesouro") { carregarSituacaoTesouroAcao(); return; }
  if (sub === "planocontas") { montarCatalogosFinanceiro(); return; }
  if (sub === "campanhas") { carregarOpcoesCongregacoesFinanceiro().then(carregarCampanhas); return; }
  if (sub === "saidas") {
    Promise.all([carregarOpcoesCongregacoesFinanceiro(), carregarOpcoesCategoriasSaida(), carregarOpcoesFornecedoresSaida(), carregarOpcoesCampanhasSaida(), carregarValorReferenciaCotacoes()])
      .then(() => { carregarFornecedores(); carregarSaidas(); carregarFundosFixos(); if (authGeral) { carregarDadosBancariosInstituicao(); carregarRemessas(); } });
    return;
  }
  if (sub === "receber") {
    Promise.all([carregarOpcoesCongregacoesFinanceiro(), carregarOpcoesCategoriasEntrada(), carregarOpcoesCampanhasSaida()])
      .then(() => carregarContasReceber());
    return;
  }
  if (sub === "orcamento") {
    Promise.all([carregarOpcoesCongregacoesFinanceiro(), carregarOpcoesCategoriasEntrada(), carregarOpcoesCategoriasSaida()])
      .then(() => { carregarOrcamentos(); alternarCongregacaoFluxoCaixa(); });
    return;
  }
  if (sub === "pdq") {
    carregarPlanosPdq();
    if (authGeral) carregarFundoExecucaoPdq(); // leitura do Fundo é só do geral (GestaoFundoExecucaoPdq); a seção nem aparece para os demais
    carregarComissoes();
    return;
  }
  if (sub === "demonstracoes") {
    alternarCamposDemonstracao();
    return;
  }
  if (sub === "rateiogeral") {
    carregarMalotePendenteAcao();
    carregarRateiosGeraisAcao();
    return;
  }
  if (sub === "prebenda") {
    carregarAtosDesignacaoAcao();
    carregarPrebendadosAcao();
    carregarOpcoesFornecedoresPrebenda();
    carregarOpcoesPrebendadosSelecao();
    carregarFolhaPrebendaAcao();
    carregarRiscosVinculoAcao();
    carregarAuxiliosCustoAcao();
    return;
  }
  if (sub === "patrimonio") {
    carregarOpcoesCongregacoesFinanceiro();
    carregarBensPatrimoniaisAcao();
    // alienação, documentos dos bens e Casa Pastoral: rotas só do geral (as seções nem aparecem para os demais; sem isto, cada abertura dava um aviso de recusa)
    if (authGeral) { carregarAlienacoesBensAcao(); carregarDocumentosBensAcao(); carregarOcupacoesCasaPastoralAcao(); }
    carregarInventariosAcao();
    return;
  }
  if (sub === "frota") {
    carregarFrotaAcao();
    carregarTermosConducaoAcao();
    carregarRetiradasChaveAcao();
    carregarManutencoesVeiculoAcao();
    carregarAlertasFrotaAcao();
    return;
  }
  if (sub === "conciliacao") {
    carregarFontesCaixaAcao();
    carregarConciliacoesAcao();
    return;
  }
  if (sub === "investimentos") {
    carregarPortfolioAcao();
    carregarLiquidezAcao();
    carregarCashPoolingAcao();
    return;
  }
  if (sub === "repasses") {
    carregarRepassesInstitucionaisAcao();
    return;
  }
  if (sub === "seguros") {
    carregarSegurosAcao();
    return;
  }
  if (sub === "parametrosmonetarios") {
    carregarParametrosMonetariosAcao();
    return;
  }
  if (sub === "cessoes") {
    carregarOpcoesCongregacoesFinanceiro();
    carregarCessoesTemploAcao();
    return;
  }
  if (sub === "obrigacoes") {
    carregarObrigacoesFiscaisAcao();
    return;
  }
  if (sub === "imunidade") {
    carregarImunidadeTributariaAcao();
    return;
  }
  if (sub === "receitasacessorias") {
    carregarReceitasAcessoriasAcao();
    carregarRelatorioOrigemDestinoAcao();
    return;
  }
  if (sub === "imoveis") {
    carregarImoveisAcao();
    return;
  }
  if (sub === "obras") {
    carregarOpcoesCongregacoesFinanceiro();
    carregarObrasAcao();
    return;
  }
  Promise.all([carregarOpcoesCongregacoesFinanceiro(), carregarOpcoesCategoriasEntrada()]).then(() => {
    if (sub === "lancamentos") { carregarOpcoesDizimistas(); carregarLancamentosTesouraria(); }
    if (sub === "dizimistas") carregarDizimistasMes();
    if (sub === "fechamento") carregarResumoFechamento();
    if (sub === "parametros") carregarParametrosTesouraria();
    if (sub === "consolidado") carregarConsolidadoTesouraria();
  });
}

// v4.1.5 — categorias de entrada configuráveis (Catálogos → Categorias de
// Entrada), não mais um enum fixo no código — cadastrar uma nova categoria
// (ex: "Entrada de Ação Social") já basta pra ela aparecer aqui.
async function carregarOpcoesCategoriasEntrada() {
  if (!_categoriasEntradaCache) {
    const res = await fetchProtegido(`${API_BASE}/catalogos/categoriasEntrada`);
    _categoriasEntradaCache = await listaDaApi(res);
  }
  ["financeiroLancTipo", "autolancTipo", "receberTipo"].forEach(idSelect => {
    const select = document.getElementById(idSelect);
    if (select && !select.dataset.montado) {
      select.innerHTML = _categoriasEntradaCache.filter(c => c.ativa !== false)
        .map(c => `<option value="${escaparHtmlEbd(c.codigo)}">${escaparHtmlEbd(c.nome)}</option>`).join("");
      select.dataset.montado = "1";
    }
  });
}

function nomeCategoriaEntrada(codigo) {
  const categoria = (_categoriasEntradaCache || []).find(c => c.codigo === codigo);
  return categoria ? categoria.nome : codigo;
}

function mesAtualFinanceiro() {
  const hoje = new Date();
  return `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}`;
}

// Lista de congregações reaproveitada nos 4 seletores da aba (Lançamentos,
// Fechamento, Relatório, Parâmetros) — cacheada na sessão pra não repetir a
// mesma consulta a cada troca de sub-aba.
async function carregarOpcoesCongregacoesFinanceiro() {
  if (!_congregacoesFinanceiroCache) {
    const res = await fetchProtegido(`${API_BASE}/catalogos/congregacoes`);
    _congregacoesFinanceiroCache = await res.json();
  }
  const opcoes = _congregacoesFinanceiroCache
    .filter(c => c.ativa !== false)
    .map(c => `<option value="${c.congregacaoId}">${escaparHtmlEbd(c.nome)}</option>`).join("");
  ["financeiroLancCongregacao", "financeiroFechCongregacao", "financeiroRelCongregacao", "financeiroParamCongregacao", "financeiroDizCongregacao", "saidaCongregacao", "fundoFixoCongregacao", "receberCongregacao", "fluxoCongregacao", "casaCongregacao", "invCongregacao", "cessaoCongregacao", "doacaoCongregacao", "obraCongregacao"].forEach(id => {
    const select = document.getElementById(id);
    if (select && !select.dataset.montado) {
      select.innerHTML = opcoes;
      select.dataset.montado = "1";
    }
  });
  const filtroCongSaida = document.getElementById("saidaFiltroCongregacao");
  if (filtroCongSaida && !filtroCongSaida.dataset.montado) {
    filtroCongSaida.innerHTML = `<option value="">Todas as congregações</option>` + opcoes;
    filtroCongSaida.dataset.montado = "1";
    filtroCongSaida.addEventListener("change", carregarSaidas);
  }
  const filtroCongReceber = document.getElementById("receberFiltroCongregacao");
  if (filtroCongReceber && !filtroCongReceber.dataset.montado) {
    filtroCongReceber.innerHTML = `<option value="">Todas as congregações</option>` + opcoes;
    filtroCongReceber.dataset.montado = "1";
    filtroCongReceber.addEventListener("change", carregarContasReceber);
  }
  ["financeiroLancMes", "financeiroFechMes", "financeiroRelMes", "financeiroConsolidadoMes", "financeiroDizMes"].forEach(id => {
    const input = document.getElementById(id);
    if (input && !input.value) input.value = mesAtualFinanceiro();
  });
}

// ---- CAMPANHAS DE ARRECADAÇÃO E SORTEIOS (v4.4) — meta geral sempre
// calculada na leitura a partir das metas por congregação (personalizadas,
// uma pode ter meta diferente da outra) e dos lançamentos vinculados via
// CampanhaId. Sorteio é só um Tipo de campanha, mesma base. Criar/encerrar/
// cancelar/sortear é restrito a nível Global (auth.js já barra no backend;
// aqui só escondemos os botões pra quem não tem esse nível).
function alternarFormNovaCampanha() {
  const form = document.getElementById("formNovaCampanha");
  const abrindo = form.style.display === "none";
  form.style.display = abrindo ? "block" : "none";
  if (abrindo) montarMetasBuilderCampanha();
}

function montarMetasBuilderCampanha() {
  const container = document.getElementById("metasBuilderCampanha");
  const congregacoes = (_congregacoesFinanceiroCache || []).filter(c => c.ativa !== false);
  container.innerHTML = `<table class="tabela-frequencia"><thead><tr><th></th><th>Congregação</th><th>Meta (R$)</th></tr></thead><tbody>
    ${congregacoes.map(c => `<tr>
      <td><input type="checkbox" class="chk-meta-campanha" value="${c.congregacaoId}" /></td>
      <td>${escaparHtmlEbd(c.nome)}</td>
      <td><input type="number" class="valor-meta-campanha" min="0.01" step="0.01" style="max-width:130px;" placeholder="0,00" /></td>
    </tr>`).join("")}
  </tbody></table>`;
}

async function criarCampanhaAcao() {
  const nome = document.getElementById("campanhaNome").value.trim();
  const descricao = document.getElementById("campanhaDescricao").value.trim();
  const dataInicio = document.getElementById("campanhaDataInicio").value;
  const dataFim = document.getElementById("campanhaDataFim").value;
  const resultado = document.getElementById("resultadoNovaCampanha");
  if (!nome || !dataInicio) { resultado.textContent = "Informe o nome e a data de início."; return; }

  const metas = [];
  document.querySelectorAll(".chk-meta-campanha:checked").forEach(chk => {
    const linha = chk.closest("tr");
    const valorMeta = linha.querySelector(".valor-meta-campanha").value;
    if (valorMeta && Number(valorMeta) > 0) metas.push({ congregacaoId: Number(chk.value), metaValor: Number(valorMeta) });
  });
  if (metas.length === 0) { resultado.textContent = "Marque ao menos uma congregação e informe a meta dela."; return; }

  const body = { nome, dataInicio, dataFim: dataFim || undefined, descricao: descricao || undefined, metas };

  const res = await fetchProtegido(`${API_BASE}/campanhas`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body)
  });
  const data = await res.json();
  avisarResultado(data);
  resultado.textContent = data.mensagem;
  if (data.sucesso) {
    document.getElementById("campanhaNome").value = "";
    document.getElementById("campanhaDescricao").value = "";
    document.getElementById("formNovaCampanha").style.display = "none";
    carregarCampanhas();
  }
}

function barraProgressoCampanha(totalArrecadado, metaTotal) {
  const percentual = metaTotal > 0 ? Math.min(100, (totalArrecadado / metaTotal) * 100) : 0;
  return `<div style="background:#e4e4e4; border-radius:8px; overflow:hidden; height:16px; width:100%; max-width:260px;">
    <div style="background: var(--cor-primaria); height:100%; width:${percentual.toFixed(1)}%;"></div>
  </div>
  <small>R$ ${Number(totalArrecadado).toFixed(2)} de R$ ${Number(metaTotal).toFixed(2)} (${percentual.toFixed(1)}%)</small>`;
}

async function carregarCampanhas() {
  const container = document.getElementById("resultadoCampanhas");
  const res = await fetchProtegido(`${API_BASE}/campanhas`);
  const campanhas = await jsonDaTela(res, container, "lista");
  if (campanhas === null) return;
  if (!Array.isArray(campanhas) || campanhas.length === 0) {
    container.innerHTML = "<p class='subtitle'>Nenhuma campanha cadastrada ainda.</p>";
    return;
  }
  // Quem não é da administração geral vê os números só das congregações do seu escopo (o servidor marca com agregadoDoEscopo).
  let html = (campanhas.some(c => c.agregadoDoEscopo) ? "<p class='subtitle'>Os valores de meta e arrecadação abaixo são das congregações do seu escopo.</p>" : "") +
    `<table class="tabela-frequencia"><thead><tr><th>Nome</th><th>Progresso</th><th>Status</th><th></th></tr></thead><tbody>`;
  campanhas.forEach(c => {
    const statusClasse = c.status === "ATIVA" ? "badge-ativo" : (c.status === "ENCERRADA" ? "badge-licenca" : "badge-desligado");
    html += `<tr>
      <td>${escaparHtmlEbd(c.nome)}${c.totalSorteios > 0 ? ` <small>🎟️ ${escaparHtmlEbd(c.totalSorteios)} sorteio(s)</small>` : ""}</td>
      <td>${barraProgressoCampanha(c.totalArrecadado, c.metaTotal)}</td>
      <td><span class="badge-status ${statusClasse}">${escaparHtmlEbd(c.status)}</span></td>
      <td class="acoes-inline"><button class="btn-link" data-on-click="verDetalheCampanhaAcao" data-args-click="${argsAttr(c.campanhaId)}">Ver detalhe</button></td>
    </tr>`;
  });
  html += "</tbody></table>";
  container.innerHTML = html;
}

async function verDetalheCampanhaAcao(campanhaId) {
  const container = document.getElementById("detalheCampanha");
  const res = await fetchProtegido(`${API_BASE}/campanhas/${campanhaId}`);
  const c = await jsonDaTela(res, container, "objeto");
  if (c === null) return;
  if (c.sucesso === false) { container.innerHTML = `<p class="subtitle">${escaparHtmlEbd(c.mensagem)}</p>`; return; }

  let html = `<hr /><h3>${escaparHtmlEbd(c.nome)}</h3>`;
  if (c.descricao) html += `<p class="subtitle">${escaparHtmlEbd(c.descricao)}</p>`;
  html += `<p class="subtitle">Período: ${escaparHtmlEbd(c.dataInicio)}${c.dataFim ? ` até ${escaparHtmlEbd(c.dataFim)}` : " (sem data de fim)"} — Status: <span class="badge-status ${c.status === "ATIVA" ? "badge-ativo" : (c.status === "ENCERRADA" ? "badge-licenca" : "badge-desligado")}">${escaparHtmlEbd(c.status)}</span></p>`;

  html += `<table class="tabela-frequencia"><thead><tr><th>Congregação</th><th>Meta</th><th>Arrecadado</th></tr></thead><tbody>`;
  c.metas.forEach(m => {
    html += `<tr><td>${escaparHtmlEbd(m.congregacaoNome)}</td><td>R$ ${Number(m.metaValor).toFixed(2)}</td><td>R$ ${Number(m.totalArrecadado).toFixed(2)}</td></tr>`;
  });
  html += "</tbody></table>";

  if (authGeral && c.status === "ATIVA") {
    html += `<button class="btn-link btn-link-perigo" data-on-click="atualizarStatusCampanhaAcao" data-args-click="${argsAttr(campanhaId, "ENCERRADA")}">🔒 Encerrar campanha</button>
      <button class="btn-link btn-link-perigo" data-on-click="atualizarStatusCampanhaAcao" data-args-click="${argsAttr(campanhaId, "CANCELADA")}">Cancelar campanha</button>`;
  }

  // v4.4.1 — Sorteio é um derivado opcional da campanha (cupom físico,
  // vendido a qualquer pessoa; o sistema só guarda prêmios e resultado).
  html += `<h4 style="margin:16px 0 8px; color: var(--cor-primaria);">🎟️ Sorteios desta campanha</h4>
    <div id="listaSorteiosCampanha_${campanhaId}"><p class="subtitle">Carregando…</p></div>`;
  if (authGeral && c.status === "ATIVA") {
    html += `<button class="btn-link" data-on-click="alternarFormNovoSorteio" data-args-click="${argsAttr(campanhaId)}">➕ Novo sorteio</button>
      <div id="formNovoSorteio_${campanhaId}" style="display:none; margin-top:10px;">
        <div class="barra-lista">
          <input type="text" id="sorteioNome_${campanhaId}" placeholder="Nome do sorteio" style="min-width:220px;" />
          <input type="number" id="sorteioPrecoCupom_${campanhaId}" placeholder="Preço do cupom (R$, informativo)" min="0.01" step="0.01" style="max-width:220px;" />
          <input type="date" id="sorteioData_${campanhaId}" />
        </div>
        <div class="input-group">
          <input type="text" id="sorteioDescricao_${campanhaId}" placeholder="Descrição (opcional)" />
        </div>
        <p class="subtitle">Prêmios (um por linha — é o que diferencia o sorteio de uma campanha comum):</p>
        <textarea id="sorteioPremios_${campanhaId}" rows="3" style="width:100%;" placeholder="1º prêmio: uma TV&#10;2º prêmio: uma cesta básica"></textarea>
        <button class="btn-confirmar" style="width:auto;margin-top:8px;" data-on-click="criarSorteioAcao" data-args-click="${argsAttr(campanhaId)}">Criar sorteio</button>
        <p id="resultadoNovoSorteio_${campanhaId}" class="subtitle"></p>
      </div>`;
  }
  container.innerHTML = html;
  carregarSorteiosCampanha(campanhaId);
}

function alternarFormNovoSorteio(campanhaId) {
  const form = document.getElementById(`formNovoSorteio_${campanhaId}`);
  form.style.display = form.style.display === "none" ? "block" : "none";
}

async function criarSorteioAcao(campanhaId) {
  const nome = document.getElementById(`sorteioNome_${campanhaId}`).value.trim();
  const descricao = document.getElementById(`sorteioDescricao_${campanhaId}`).value.trim();
  const precoCupom = document.getElementById(`sorteioPrecoCupom_${campanhaId}`).value;
  const dataSorteio = document.getElementById(`sorteioData_${campanhaId}`).value;
  const premiosTexto = document.getElementById(`sorteioPremios_${campanhaId}`).value;
  const resultado = document.getElementById(`resultadoNovoSorteio_${campanhaId}`);
  const premios = premiosTexto.split("\n").map(l => l.trim()).filter(l => l);
  if (!nome || premios.length === 0) { resultado.textContent = "Informe o nome e ao menos um prêmio (um por linha)."; return; }

  const body = { nome, descricao: descricao || undefined, precoCupom: precoCupom ? Number(precoCupom) : undefined, dataSorteio: dataSorteio || undefined, premios };
  const res = await fetchProtegido(`${API_BASE}/campanhas/${campanhaId}/sorteios`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body)
  });
  const data = await res.json();
  avisarResultado(data);
  resultado.textContent = data.mensagem;
  if (data.sucesso) {
    document.getElementById(`formNovoSorteio_${campanhaId}`).style.display = "none";
    carregarSorteiosCampanha(campanhaId);
  }
}

async function carregarSorteiosCampanha(campanhaId) {
  const container = document.getElementById(`listaSorteiosCampanha_${campanhaId}`);
  if (!container) return;
  const res = await fetchProtegido(`${API_BASE}/campanhas/${campanhaId}/sorteios`);
  const sorteios = await jsonDaTela(res, container, "lista");
  if (sorteios === null) return;
  if (!Array.isArray(sorteios) || sorteios.length === 0) {
    container.innerHTML = "<p class='subtitle'>Nenhum sorteio derivado desta campanha ainda.</p>";
    return;
  }
  let html = "";
  for (const s of sorteios) {
    const statusClasse = s.status === "ATIVO" ? "badge-ativo" : (s.status === "REALIZADO" ? "badge-licenca" : "badge-desligado");
    html += `<div style="border:1px solid #e0e0e0; border-radius:8px; padding:10px; margin-bottom:10px;">
      <strong>${escaparHtmlEbd(s.nome)}</strong> <span class="badge-status ${statusClasse}">${escaparHtmlEbd(s.status)}</span>
      ${s.precoCupom ? ` — cupom R$ ${Number(s.precoCupom).toFixed(2)}` : ""}${s.dataSorteio ? ` — sorteio em ${escaparHtmlEbd(s.dataSorteio)}` : ""}
      <br /><small>${escaparHtmlEbd(s.premiosComGanhador)} de ${escaparHtmlEbd(s.totalPremios)} prêmio(s) já com ganhador registrado</small>
      <div id="detalheSorteio_${s.sorteioId}" style="margin-top:8px;"></div>
      <button class="btn-link" data-on-click="verDetalheSorteioAcao" data-args-click="${argsAttr(campanhaId, s.sorteioId)}">Ver prêmios / registrar ganhador</button>
    </div>`;
  }
  container.innerHTML = html;
}

async function verDetalheSorteioAcao(campanhaId, sorteioId) {
  const container = document.getElementById(`detalheSorteio_${sorteioId}`);
  const res = await fetchProtegido(`${API_BASE}/campanhas/${campanhaId}/sorteios/${sorteioId}`);
  const s = await jsonDaTela(res, container, "objeto");
  if (s === null) return;
  if (s.sucesso === false) { container.innerHTML = `<p class="subtitle">${escaparHtmlEbd(s.mensagem)}</p>`; return; }
  let html = `<table class="tabela-frequencia"><thead><tr><th>Ordem</th><th>Prêmio</th><th>Ganhador</th></tr></thead><tbody>`;
  s.premios.forEach(p => {
    const podeEditar = authGeral && s.status !== "CANCELADO";
    html += `<tr>
      <td>${escaparHtmlEbd(p.ordem)}</td><td>${escaparHtmlEbd(p.descricao)}</td>
      <td>${podeEditar
        ? `<input type="text" id="ganhadorPremio_${p.premioId}" value="${escaparHtmlEbd(p.nomeGanhador) || ""}" placeholder="Nome de quem ganhou" style="max-width:200px;" />
           <button class="btn-link" data-on-click="registrarGanhadorAcao" data-args-click="${argsAttr(campanhaId, sorteioId, p.premioId)}">Salvar</button>`
        : (escaparHtmlEbd(p.nomeGanhador) || "—")}</td>
    </tr>`;
  });
  html += "</tbody></table>";
  if (authGeral && s.status === "ATIVO") {
    html += `<button class="btn-link" data-on-click="marcarSorteioRealizadoAcao" data-args-click="${argsAttr(campanhaId, sorteioId)}">✅ Marcar sorteio como realizado</button>`;
  }
  container.innerHTML = html;
}

async function registrarGanhadorAcao(campanhaId, sorteioId, premioId) {
  const nomeGanhador = document.getElementById(`ganhadorPremio_${premioId}`).value.trim();
  const res = await fetchProtegido(`${API_BASE}/campanhas/${campanhaId}/sorteios/${sorteioId}`, {
    method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ premios: [{ premioId, nomeGanhador }] })
  });
  const data = await res.json();
  avisarResultado(data);
  if (data.sucesso) { verDetalheSorteioAcao(campanhaId, sorteioId); carregarSorteiosCampanha(campanhaId); }
}

async function marcarSorteioRealizadoAcao(campanhaId, sorteioId) {
  const res = await fetchProtegido(`${API_BASE}/campanhas/${campanhaId}/sorteios/${sorteioId}`, {
    method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "REALIZADO" })
  });
  const data = await res.json();
  avisarResultado(data);
  if (data.sucesso) { verDetalheSorteioAcao(campanhaId, sorteioId); carregarSorteiosCampanha(campanhaId); }
}

async function atualizarStatusCampanhaAcao(campanhaId, status) {
  const acaoTexto = status === "ENCERRADA" ? "encerrar" : "cancelar";
  const motivo = await pedirTexto(`Confirma ${acaoTexto} esta campanha?`, "Digite qualquer texto para confirmar");
  if (motivo === null) return;
  const res = await fetchProtegido(`${API_BASE}/campanhas/${campanhaId}`, {
    method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status })
  });
  const data = await res.json();
  avisarResultado(data);
  if (data.sucesso) { carregarCampanhas(); verDetalheCampanhaAcao(campanhaId); }
}

// ---- SAÍDAS: CONTAS A PAGAR (v4.5, primeira parte) — Fornecedores +
// Solicitação de Pagamento → aprovação por alçada de valor → pagamento,
// com segregação de funções e saldo do Centro de Custo nunca negativo.
let _categoriasSaidaCache = null;
let _fornecedoresSaidaCache = null;
let _campanhasSaidaCache = null;

async function carregarOpcoesCategoriasSaida() {
  const res = await fetchProtegido(`${API_BASE}/catalogos/categoriasSaida`);
  _categoriasSaidaCache = await listaDaApi(res);
  const select = document.getElementById("saidaTipo");
  if (select) {
    select.innerHTML = _categoriasSaidaCache.filter(c => c.ativa !== false)
      .map(c => `<option value="${escaparHtmlEbd(c.codigo)}">${escaparHtmlEbd(c.nome)} (${c.centroCusto === "GERAL" ? "Geral" : "Local"}${c.tipoFundo === "RESTRITO" ? " — restrito" : ""})</option>`).join("");
  }
}

async function carregarOpcoesFornecedoresSaida() {
  const res = await fetchProtegido(`${API_BASE}/fornecedores`);
  _fornecedoresSaidaCache = await res.json();
  const select = document.getElementById("saidaFornecedor");
  if (select) {
    select.innerHTML = (Array.isArray(_fornecedoresSaidaCache) ? _fornecedoresSaidaCache : [])
      .filter(f => f.ativo !== false)
      .map(f => `<option value="${Number(f.fornecedorId)}">${escaparHtmlEbd(f.nome)}${!f.dadosBancariosConfirmados ? " ⚠️ dados bancários pendentes" : ""}</option>`).join("");
  }
}

async function carregarOpcoesCampanhasSaida() {
  const res = await fetchProtegido(`${API_BASE}/campanhas`);
  const campanhas = await res.json();
  _campanhasSaidaCache = Array.isArray(campanhas) ? campanhas.filter(c => c.status === "ATIVA") : [];
  const opcoes = _campanhasSaidaCache.map(c => `<option value="${c.campanhaId}">${escaparHtmlEbd(c.nome)}</option>`).join("");
  const select = document.getElementById("saidaCampanha");
  if (select) select.innerHTML = opcoes;
  const selectReceber = document.getElementById("receberCampanha");
  if (selectReceber) selectReceber.innerHTML = `<option value="">— Sem campanha —</option>` + opcoes;
}

function alternarCampoCampanhaSaida() {
  const tipo = document.getElementById("saidaTipo").value;
  const categoria = (_categoriasSaidaCache || []).find(c => c.codigo === tipo);
  document.getElementById("saidaCampanha").style.display = categoria && categoria.tipoFundo === "RESTRITO" ? "inline-block" : "none";
  const campoCombustivel = document.getElementById("saidaCombustivelCampos");
  if (campoCombustivel) campoCombustivel.style.display = tipo === "COMBUSTIVEL" ? "block" : "none";
}

function alternarFormNovoFornecedor() {
  const form = document.getElementById("formNovoFornecedor");
  form.style.display = form.style.display === "none" ? "block" : "none";
}

async function salvarFornecedorAcao() {
  const nome = document.getElementById("fornecedorNome").value.trim();
  const cpfCnpj = document.getElementById("fornecedorCpfCnpj").value.trim();
  const tipo = document.getElementById("fornecedorTipo").value;
  const telefone = document.getElementById("fornecedorTelefone").value.trim();
  const email = document.getElementById("fornecedorEmail").value.trim();
  const banco = document.getElementById("fornecedorBanco").value.trim();
  const agencia = document.getElementById("fornecedorAgencia").value.trim();
  const conta = document.getElementById("fornecedorConta").value.trim();
  const tipoConta = document.getElementById("fornecedorTipoConta").value;
  const chavePix = document.getElementById("fornecedorChavePix").value.trim();
  const resultado = document.getElementById("resultadoFornecedor");
  if (!nome || !cpfCnpj) { resultado.textContent = "Informe o nome e o CPF/CNPJ."; return; }

  const body = { nome, cpfCnpj, tipo, telefone: telefone || undefined, email: email || undefined, banco: banco || undefined, agencia: agencia || undefined, conta: conta || undefined, tipoConta: tipoConta || undefined, chavePix: chavePix || undefined };
  const res = await fetchProtegido(`${API_BASE}/fornecedores`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body)
  });
  const data = await res.json();
  avisarResultado(data);
  resultado.textContent = data.mensagem;
  if (data.sucesso) {
    ["fornecedorNome", "fornecedorCpfCnpj", "fornecedorTelefone", "fornecedorEmail", "fornecedorBanco", "fornecedorAgencia", "fornecedorConta", "fornecedorChavePix"].forEach(id => document.getElementById(id).value = "");
    document.getElementById("formNovoFornecedor").style.display = "none";
    document.getElementById("saidaFornecedor").dataset.montado = "";
    carregarOpcoesFornecedoresSaida();
    carregarFornecedores();
  }
}

async function carregarFornecedores() {
  const container = document.getElementById("resultadoFornecedores");
  const res = await fetchProtegido(`${API_BASE}/fornecedores`);
  const fornecedores = await jsonDaTela(res, container, "lista");
  if (fornecedores === null) return;
  if (!Array.isArray(fornecedores) || fornecedores.length === 0) {
    container.innerHTML = "<p class='subtitle'>Nenhum fornecedor cadastrado ainda.</p>";
    return;
  }
  // Só a administração geral vê CPF/CNPJ e dados bancários dos fornecedores, confirma os dados e anexa documentos; o tesoureiro local recebe só nome e situação.
  let html = `<table class="tabela-frequencia"><thead><tr><th>Nome</th>${authGeral ? "<th>CPF/CNPJ</th>" : ""}<th>Dados bancários</th><th></th></tr></thead><tbody>`;
  fornecedores.forEach(f => {
    html += `<tr>
      <td>${escaparHtmlEbd(f.nome)}</td>${authGeral ? `<td>${escaparHtmlEbd(f.cpfCnpj)}</td>` : ""}
      <td>${f.dadosBancariosConfirmados ? "<span class='badge-status badge-ativo'>Confirmados</span>" : "<span class='badge-status badge-pendente'>⚠️ Pendente de confirmação</span>"}</td>
      <td class="acoes-inline">
        ${authGeral && !f.dadosBancariosConfirmados ? `<button class="btn-link" data-on-click="confirmarDadosBancariosFornecedorAcao" data-args-click="${argsAttr(Number(f.fornecedorId))}">Confirmar</button>` : ""}
        ${authGeral ? `<button class="btn-link" data-on-click="abrirModalAnexos" data-args-click="${argsAttr("Fornecedores", Number(f.fornecedorId), String(f.nome ?? ""))}">📎 Anexos</button>` : ""}
      </td>
    </tr>`;
  });
  html += "</tbody></table>";
  container.innerHTML = html;
}

async function confirmarDadosBancariosFornecedorAcao(fornecedorId) {
  const res = await fetchProtegido(`${API_BASE}/fornecedores/${fornecedorId}/confirmar-dados-bancarios`, { method: "POST" });
  const data = await res.json();
  avisarResultado(data);
  if (data.sucesso) { carregarFornecedores(); carregarOpcoesFornecedoresSaida(); }
}

function alternarFormNovaSaida() {
  const form = document.getElementById("formNovaSaida");
  form.style.display = form.style.display === "none" ? "block" : "none";
}

// v4.5 (segunda parte) — valor de referência (Reg. Art. 62) a partir do
// qual uma solicitação exige 3 cotações anexadas. Configurável, nunca
// hardcoded — carregado de /api/parametros-saida.
let _valorReferenciaCotacoes = null;

async function carregarValorReferenciaCotacoes() {
  const res = await fetchProtegido(`${API_BASE}/parametros-saida`);
  const data = await res.json();
  _valorReferenciaCotacoes = Number(data.valorReferenciaCotacoes);
  const texto = document.getElementById("valorReferenciaCotacoesTexto");
  if (texto) texto.textContent = _valorReferenciaCotacoes.toFixed(2);
}

function alternarEdicaoValorReferenciaCotacoes() {
  const input = document.getElementById("novoValorReferenciaCotacoes");
  const btn = document.getElementById("btnEditarValorReferencia");
  if (input.style.display === "none") {
    input.value = _valorReferenciaCotacoes;
    input.style.display = "inline-block";
    btn.textContent = "salvar";
  } else {
    salvarValorReferenciaCotacoesAcao();
  }
}

async function salvarValorReferenciaCotacoesAcao() {
  const input = document.getElementById("novoValorReferenciaCotacoes");
  const valor = input.value;
  if (!valor || Number(valor) <= 0) { mostrarToast("Informe um valor maior que zero.", "erro"); return; }
  const res = await fetchProtegido(`${API_BASE}/parametros-saida`, {
    method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ valorReferenciaCotacoes: Number(valor) })
  });
  const data = await res.json();
  avisarResultado(data);
  if (data.sucesso) {
    input.style.display = "none";
    document.getElementById("btnEditarValorReferencia").textContent = "editar";
    carregarValorReferenciaCotacoes();
  }
}

function alternarCotacoesSaida() {
  const valor = Number(document.getElementById("saidaValor").value || 0);
  const container = document.getElementById("cotacoesSaidaContainer");
  const linhas = document.getElementById("cotacoesSaidaLinhas");
  const exige = _valorReferenciaCotacoes != null && valor >= _valorReferenciaCotacoes;
  container.style.display = exige ? "block" : "none";
  if (exige && !linhas.dataset.montado) {
    linhas.innerHTML = [1, 2, 3].map(n => `
      <div class="barra-lista">
        <input type="text" id="cotacaoFornecedorNome_${n}" placeholder="Fornecedor da cotação ${n}" />
        <input type="number" id="cotacaoValor_${n}" placeholder="Valor (R$)" min="0.01" step="0.01" style="max-width:140px;" />
        <input type="file" id="cotacaoDocumento_${n}" accept="image/jpeg,image/png,application/pdf" />
      </div>`).join("");
    linhas.dataset.montado = "1";
  }
}

async function solicitarSaidaAcao() {
  const congregacaoId = document.getElementById("saidaCongregacao").value;
  const fornecedorId = document.getElementById("saidaFornecedor").value;
  const tipo = document.getElementById("saidaTipo").value;
  const descricao = document.getElementById("saidaDescricao").value.trim();
  const valor = document.getElementById("saidaValor").value;
  const campanhaId = document.getElementById("saidaCampanha").value;
  const arquivo = document.getElementById("saidaDocumentoFiscal").files[0];
  const resultado = document.getElementById("resultadoNovaSaida");
  if (!congregacaoId || !fornecedorId || !tipo || !descricao || !valor || !arquivo) {
    resultado.textContent = "Preencha todos os campos e anexe a nota fiscal/recibo.";
    return;
  }
  const categoria = (_categoriasSaidaCache || []).find(c => c.codigo === tipo);
  if (categoria && categoria.tipoFundo === "RESTRITO" && !campanhaId) {
    resultado.textContent = "Esta categoria é de fundo restrito — escolha a campanha de origem.";
    return;
  }

  let cotacoes;
  if (_valorReferenciaCotacoes != null && Number(valor) >= _valorReferenciaCotacoes) {
    cotacoes = [];
    for (const n of [1, 2, 3]) {
      const nome = document.getElementById(`cotacaoFornecedorNome_${n}`).value.trim();
      const valorCotacao = document.getElementById(`cotacaoValor_${n}`).value;
      const arquivoCotacao = document.getElementById(`cotacaoDocumento_${n}`).files[0];
      if (!nome || !valorCotacao || !arquivoCotacao) {
        resultado.textContent = `Preencha as 3 cotações completas (faltou a cotação ${n}).`;
        return;
      }
      cotacoes.push({ fornecedorNome: nome, valor: Number(valorCotacao), documentoBase64: await arquivoParaBase64(arquivoCotacao), mimeType: arquivoCotacao.type });
    }
  }

  if (tipo === "COMBUSTIVEL") {
    const bemIdCombustivel = document.getElementById("saidaCombustivelBemId").value;
    const notaFiscalConfirmada = document.getElementById("saidaCombustivelNotaFiscalCnpj").checked;
    if (!bemIdCombustivel || !notaFiscalConfirmada) {
      resultado.textContent = "Combustível exige o veículo (bemId) e a confirmação de que a nota fiscal saiu no CNPJ da Igreja (Art. 155 §3º).";
      return;
    }
  }
  const body = {
    congregacaoId, fornecedorId, tipo, descricao, valor: Number(valor),
    campanhaId: (categoria && categoria.tipoFundo === "RESTRITO") ? campanhaId : undefined,
    documentoFiscalBase64: await arquivoParaBase64(arquivo), mimeType: arquivo.type,
    cotacoes,
    bemId: tipo === "COMBUSTIVEL" ? document.getElementById("saidaCombustivelBemId").value : undefined,
    notaFiscalCnpjIgrejaConfirmado: tipo === "COMBUSTIVEL" ? document.getElementById("saidaCombustivelNotaFiscalCnpj").checked : undefined
  };
  const res = await fetchProtegido(`${API_BASE}/saidas`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body)
  });
  const data = await res.json();
  avisarResultado(data);
  resultado.textContent = data.mensagem;
  if (data.sucesso) {
    document.getElementById("saidaDescricao").value = "";
    document.getElementById("saidaValor").value = "";
    document.getElementById("saidaDocumentoFiscal").value = "";
    document.getElementById("cotacoesSaidaContainer").style.display = "none";
    document.getElementById("cotacoesSaidaLinhas").innerHTML = "";
    document.getElementById("cotacoesSaidaLinhas").dataset.montado = "";
    document.getElementById("formNovaSaida").style.display = "none";
    carregarSaidas();
  }
}

function badgeStatusSaida(status) {
  const mapa = { PENDENTE: "badge-pendente", APROVADA: "badge-licenca", PAGA: "badge-ativo", REJEITADA: "badge-desligado", CANCELADA: "badge-desligado" };
  return `<span class="badge-status ${mapa[status] || "badge-inativo"}">${escaparHtmlEbd(status)}</span>`;
}

async function carregarSaidas() {
  const congregacaoId = document.getElementById("saidaFiltroCongregacao").value;
  const status = document.getElementById("saidaFiltroStatus").value;
  const container = document.getElementById("resultadoSaidas");
  const params = new URLSearchParams();
  if (congregacaoId) params.set("congregacaoId", congregacaoId);
  if (status) params.set("status", status);
  const res = await fetchProtegido(`${API_BASE}/saidas?${params.toString()}`);
  const saidas = await jsonDaTela(res, container, "lista");
  if (saidas === null) return;
  if (!Array.isArray(saidas) || saidas.length === 0) {
    container.innerHTML = "<p class='subtitle'>Nenhuma solicitação de pagamento encontrada.</p>";
    return;
  }
  let html = `<table class="tabela-frequencia"><thead><tr><th>Congregação</th><th>Fornecedor</th><th>Categoria</th><th>Valor</th><th>Status</th><th></th></tr></thead><tbody>`;
  saidas.forEach(s => {
    html += `<tr>
      <td>${escaparHtmlEbd(s.congregacaoNome)}</td><td>${escaparHtmlEbd(s.fornecedorNome)}</td><td>${escaparHtmlEbd(s.categoriaNome)}</td>
      <td>R$ ${Number(s.valor).toFixed(2)}${s.possivelDuplicidade ? " ⚠️" : ""}</td><td>${badgeStatusSaida(s.status)}</td>
      <td class="acoes-inline"><button class="btn-link" data-on-click="verDetalheSaidaAcao" data-args-click="${argsAttr(s.saidaId)}">Ver detalhe</button></td>
    </tr>`;
  });
  html += "</tbody></table>";
  container.innerHTML = html;
}

async function verDetalheSaidaAcao(saidaId) {
  const container = document.getElementById("detalheSaida");
  const res = await fetchProtegido(`${API_BASE}/saidas/${saidaId}`);
  const s = await jsonDaTela(res, container, "objeto");
  if (s === null) return;
  if (s.sucesso === false) { container.innerHTML = `<p class="subtitle">${escaparHtmlEbd(s.mensagem)}</p>`; return; }

  let html = `<hr /><h4>${escaparHtmlEbd(s.fornecedorNome)} — R$ ${Number(s.valor).toFixed(2)} ${badgeStatusSaida(s.status)}</h4>
    <p class="subtitle">${escaparHtmlEbd(s.descricao)}${s.campanhaNome ? ` — campanha: ${escaparHtmlEbd(s.campanhaNome)}` : ""}</p>
    <p class="subtitle">Solicitado por ${escaparHtmlEbd(s.solicitadoPorNome)} em ${new Date(s.solicitadoEm).toLocaleString("pt-BR")}</p>
    <p class="subtitle"><a href="${urlSegura(s.documentoFiscalUrl)}" target="_blank" rel="noopener">📎 Nota fiscal / recibo</a>${s.comprovantePagamentoUrl ? ` — <a href="${urlSegura(s.comprovantePagamentoUrl)}" target="_blank" rel="noopener">📎 Comprovante de pagamento</a>` : ""}</p>`;

  if (s.possivelDuplicidade) {
    html += `<p class="subtitle">⚠️ <strong>Possível duplicidade</strong> — já existe outra solicitação com o mesmo fornecedor e valor nos últimos 7 dias. Confira antes de aprovar.</p>`;
  }
  if (Array.isArray(s.cotacoes) && s.cotacoes.length > 0) {
    html += `<p class="subtitle">Cotações anexadas (Reg. Art. 62):</p><ul>` +
      s.cotacoes.map(c => `<li>${escaparHtmlEbd(c.fornecedorNome)} — R$ ${Number(c.valor).toFixed(2)} — <a href="${urlSegura(c.documentoUrl)}" target="_blank" rel="noopener">📎 ver</a></li>`).join("") +
      `</ul>`;
  }
  if (s.motivoRejeicao) html += `<p class="subtitle">Motivo da rejeição: ${escaparHtmlEbd(s.motivoRejeicao)}</p>`;
  if (s.motivoCancelamento) html += `<p class="subtitle">Motivo do cancelamento: ${escaparHtmlEbd(s.motivoCancelamento)}</p>`;

  if (s.status === "PENDENTE" && s.alcada) {
    html += `<p class="subtitle">Alçada exigida: nível ${escaparHtmlEbd(s.alcada.nivelMinimoAprovador)} ou superior, ${escaparHtmlEbd(s.alcada.quantidadeAprovadores)} aprovador(es) distinto(s) — ${s.aprovacoes.length} já aprovou(aram): ${s.aprovacoes.map(a => escaparHtmlEbd(a.aprovadoPorNome)).join(", ") || "ninguém ainda"}.</p>
      <button class="btn-link" data-on-click="aprovarSaidaAcao" data-args-click="${argsAttr(saidaId)}">✅ Aprovar</button>
      <button class="btn-link btn-link-perigo" data-on-click="rejeitarSaidaAcao" data-args-click="${argsAttr(saidaId)}">Rejeitar</button>`;
  }
  if (s.status === "APROVADA") {
    html += `
      <div class="input-group">
        <label>Comprovante de pagamento:</label>
        <input type="file" id="comprovantePagamentoSaida_${saidaId}" accept="image/jpeg,image/png,application/pdf" />
      </div>
      <button class="btn-confirmar" style="width:auto;" data-on-click="pagarSaidaAcao" data-args-click="${argsAttr(saidaId)}">💰 Registrar pagamento</button>`;
  }
  if (["PENDENTE", "APROVADA"].includes(s.status)) {
    html += ` <button class="btn-link btn-link-perigo" data-on-click="cancelarSaidaAcao" data-args-click="${argsAttr(saidaId)}">Cancelar</button>`;
  }
  container.innerHTML = html;
}

async function aprovarSaidaAcao(saidaId) {
  const res = await fetchProtegido(`${API_BASE}/saidas/${saidaId}`, {
    method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ acao: "APROVAR" })
  });
  const data = await res.json();
  avisarResultado(data);
  if (data.sucesso) { carregarSaidas(); verDetalheSaidaAcao(saidaId); }
}

async function rejeitarSaidaAcao(saidaId) {
  const motivo = await pedirTexto("Motivo da rejeição", "Ex: documentação insuficiente");
  if (motivo === null) return;
  if (!motivo.trim()) { mostrarToast("Informe o motivo da rejeição.", "erro"); return; }
  const res = await fetchProtegido(`${API_BASE}/saidas/${saidaId}`, {
    method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ acao: "REJEITAR", motivo })
  });
  const data = await res.json();
  avisarResultado(data);
  if (data.sucesso) { carregarSaidas(); verDetalheSaidaAcao(saidaId); }
}

async function pagarSaidaAcao(saidaId) {
  const arquivo = document.getElementById(`comprovantePagamentoSaida_${saidaId}`).files[0];
  if (!arquivo) { mostrarToast("Anexe o comprovante de pagamento.", "erro"); return; }
  const body = { acao: "PAGAR", comprovanteBase64: await arquivoParaBase64(arquivo), mimeType: arquivo.type };
  const res = await fetchProtegido(`${API_BASE}/saidas/${saidaId}`, {
    method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body)
  });
  const data = await res.json();
  avisarResultado(data);
  if (data.sucesso) { carregarSaidas(); verDetalheSaidaAcao(saidaId); }
}

async function cancelarSaidaAcao(saidaId) {
  const motivo = await pedirTexto("Motivo do cancelamento", "Ex: pagamento não é mais necessário");
  if (motivo === null) return;
  if (!motivo.trim()) { mostrarToast("Informe o motivo do cancelamento.", "erro"); return; }
  const res = await fetchProtegido(`${API_BASE}/saidas/${saidaId}`, {
    method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ acao: "CANCELAR", motivo })
  });
  const data = await res.json();
  avisarResultado(data);
  if (data.sucesso) { carregarSaidas(); verDetalheSaidaAcao(saidaId); }
}

// ---- FUNDO FIXO DE CAIXA (v4.5, segunda parte) — petty cash: teto de
// valor + custodiante responsável, saldo sempre calculado (reposições
// menos despesas), nunca marcado manualmente.
function alternarFormNovoFundoFixo() {
  const form = document.getElementById("formNovoFundoFixo");
  form.style.display = form.style.display === "none" ? "block" : "none";
}

async function criarFundoFixoAcao() {
  const congregacaoId = document.getElementById("fundoFixoCongregacao").value;
  const valorTeto = document.getElementById("fundoFixoValorTeto").value;
  const custodiantePor = document.getElementById("fundoFixoCustodianteMatricula").value;
  const resultado = document.getElementById("resultadoNovoFundoFixo");
  if (!congregacaoId || !valorTeto || !custodiantePor) {
    resultado.textContent = "Preencha congregação, teto e matrícula do custodiante.";
    return;
  }
  const res = await fetchProtegido(`${API_BASE}/fundos-fixos`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ congregacaoId, valorTeto: Number(valorTeto), custodiantePor: Number(custodiantePor) })
  });
  const data = await res.json();
  avisarResultado(data);
  resultado.textContent = data.mensagem;
  if (data.sucesso) {
    document.getElementById("fundoFixoValorTeto").value = "";
    document.getElementById("fundoFixoCustodianteMatricula").value = "";
    document.getElementById("formNovoFundoFixo").style.display = "none";
    carregarFundosFixos();
  }
}

async function carregarFundosFixos() {
  const container = document.getElementById("resultadoFundosFixos");
  const res = await fetchProtegido(`${API_BASE}/fundos-fixos`);
  const fundos = await jsonDaTela(res, container, "lista");
  if (fundos === null) return;
  if (!Array.isArray(fundos) || fundos.length === 0) {
    container.innerHTML = "<p class='subtitle'>Nenhum Fundo Fixo de Caixa cadastrado ainda.</p>";
    return;
  }
  let html = `<table class="tabela-frequencia"><thead><tr><th>Congregação</th><th>Custodiante</th><th>Teto</th><th>Saldo atual</th><th>Status</th><th></th></tr></thead><tbody>`;
  fundos.forEach(f => {
    html += `<tr>
      <td>${escaparHtmlEbd(f.congregacaoNome)}</td><td>${escaparHtmlEbd(f.custodianteNome)}</td>
      <td>R$ ${Number(f.valorTeto).toFixed(2)}</td><td>R$ ${Number(f.saldoAtual).toFixed(2)}</td>
      <td><span class="badge-status ${f.status === "ATIVO" ? "badge-ativo" : "badge-inativo"}">${escaparHtmlEbd(f.status)}</span></td>
      <td class="acoes-inline"><button class="btn-link" data-on-click="verDetalheFundoFixoAcao" data-args-click="${argsAttr(f.fundoId)}">Ver detalhe</button></td>
    </tr>`;
  });
  html += "</tbody></table>";
  container.innerHTML = html;
}

async function verDetalheFundoFixoAcao(fundoId) {
  const container = document.getElementById("detalheFundoFixo");
  const res = await fetchProtegido(`${API_BASE}/fundos-fixos/${fundoId}`);
  const f = await jsonDaTela(res, container, "objeto");
  if (f === null) return;
  if (f.sucesso === false) { container.innerHTML = `<p class="subtitle">${escaparHtmlEbd(f.mensagem)}</p>`; return; }

  const resMov = await fetchProtegido(`${API_BASE}/fundos-fixos/${fundoId}/movimentos`);
  const movimentos = await jsonDaTela(resMov, container, "lista");
  if (movimentos === null) return;

  let html = `<hr /><h4>${escaparHtmlEbd(f.congregacaoNome)} — custodiante: ${escaparHtmlEbd(f.custodianteNome)}</h4>
    <p class="subtitle">Teto: R$ ${Number(f.valorTeto).toFixed(2)} — Saldo atual: R$ ${Number(f.saldoAtual).toFixed(2)}</p>`;

  if (f.status === "ATIVO") {
    html += `
      <div class="barra-lista">
        <select id="fundoFixoMovTipo_${fundoId}">
          <option value="DESPESA">Despesa</option>
          <option value="REPOSICAO">Reposição</option>
        </select>
        <input type="number" id="fundoFixoMovValor_${fundoId}" placeholder="Valor (R$)" min="0.01" step="0.01" style="max-width:140px;" />
      </div>
      <div class="input-group">
        <input type="text" id="fundoFixoMovDescricao_${fundoId}" placeholder="Descrição" />
      </div>
      <div class="input-group">
        <label>Recibo / comprovante (obrigatório):</label>
        <input type="file" id="fundoFixoMovDocumento_${fundoId}" accept="image/jpeg,image/png,application/pdf" />
      </div>
      <button class="btn-confirmar" style="width:auto;" data-on-click="registrarMovimentoFundoFixoAcao" data-args-click="${argsAttr(fundoId)}">Registrar Movimento</button>
      <p id="resultadoMovimentoFundoFixo_${fundoId}" class="subtitle"></p>`;
  }

  html += `<h4 style="margin:16px 0 8px; color: var(--cor-primaria);">Histórico</h4>`;
  if (!Array.isArray(movimentos) || movimentos.length === 0) {
    html += "<p class='subtitle'>Nenhum movimento registrado ainda.</p>";
  } else {
    html += `<table class="tabela-frequencia"><thead><tr><th>Tipo</th><th>Valor</th><th>Descrição</th><th>Registrado por</th><th></th></tr></thead><tbody>`;
    movimentos.forEach(m => {
      html += `<tr>
        <td>${m.tipo === "DESPESA" ? "Despesa" : "Reposição"}</td><td>R$ ${Number(m.valor).toFixed(2)}</td>
        <td>${escaparHtmlEbd(m.descricao)}</td><td>${escaparHtmlEbd(m.registradoPorNome)}</td>
        <td><a href="${urlSegura(m.documentoUrl)}" target="_blank" rel="noopener">📎</a></td>
      </tr>`;
    });
    html += "</tbody></table>";
  }
  container.innerHTML = html;
}

async function registrarMovimentoFundoFixoAcao(fundoId) {
  const tipo = document.getElementById(`fundoFixoMovTipo_${fundoId}`).value;
  const valor = document.getElementById(`fundoFixoMovValor_${fundoId}`).value;
  const descricao = document.getElementById(`fundoFixoMovDescricao_${fundoId}`).value.trim();
  const arquivo = document.getElementById(`fundoFixoMovDocumento_${fundoId}`).files[0];
  const resultado = document.getElementById(`resultadoMovimentoFundoFixo_${fundoId}`);
  if (!valor || !descricao || !arquivo) {
    resultado.textContent = "Preencha o valor, a descrição, e anexe o recibo/comprovante.";
    return;
  }
  const body = { tipo, valor: Number(valor), descricao, documentoBase64: await arquivoParaBase64(arquivo), mimeType: arquivo.type };
  const res = await fetchProtegido(`${API_BASE}/fundos-fixos/${fundoId}/movimentos`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body)
  });
  const data = await res.json();
  avisarResultado(data);
  resultado.textContent = data.mensagem;
  if (data.sucesso) { verDetalheFundoFixoAcao(fundoId); carregarFundosFixos(); }
}

// ---- REMESSA BANCÁRIA CNAB 240 (v4.7) — gera um único arquivo pra pagar
// várias Saídas já aprovadas de uma vez; a leitura do arquivo de retorno
// confirma o pagamento automaticamente (ou marca falha, sem travar as
// demais). Gerar remessa e processar retorno são restritos a nível Global.
function alternarFormDadosBancariosInstituicao() {
  const form = document.getElementById("formDadosBancariosInstituicao");
  form.style.display = form.style.display === "none" ? "block" : "none";
}

async function carregarDadosBancariosInstituicao() {
  const res = await fetchProtegido(`${API_BASE}/dados-bancarios-instituicao`);
  const d = await jsonDaTela(res, document.getElementById("resultadoDadosBancariosInstituicao"), "objeto");
  if (d === null) return;
  document.getElementById("instRazaoSocial").value = d.razaoSocial || "";
  document.getElementById("instCnpj").value = d.cnpj || "";
  document.getElementById("instCodigoBanco").value = d.codigoBanco || "";
  document.getElementById("instNomeBanco").value = d.nomeBanco || "";
  document.getElementById("instAgencia").value = d.agencia || "";
  document.getElementById("instDigitoAgencia").value = d.digitoAgencia || "";
  document.getElementById("instConta").value = d.conta || "";
  document.getElementById("instDigitoConta").value = d.digitoConta || "";
  document.getElementById("instCodigoConvenio").value = d.codigoConvenio || "";
}

async function salvarDadosBancariosInstituicaoAcao() {
  const body = {
    razaoSocial: document.getElementById("instRazaoSocial").value.trim(),
    cnpj: document.getElementById("instCnpj").value.trim(),
    codigoBanco: document.getElementById("instCodigoBanco").value.trim(),
    nomeBanco: document.getElementById("instNomeBanco").value.trim(),
    agencia: document.getElementById("instAgencia").value.trim(),
    digitoAgencia: document.getElementById("instDigitoAgencia").value.trim(),
    conta: document.getElementById("instConta").value.trim(),
    digitoConta: document.getElementById("instDigitoConta").value.trim(),
    codigoConvenio: document.getElementById("instCodigoConvenio").value.trim()
  };
  const res = await fetchProtegido(`${API_BASE}/dados-bancarios-instituicao`, {
    method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body)
  });
  const data = await res.json();
  avisarResultado(data);
  document.getElementById("resultadoDadosBancariosInstituicao").textContent = data.mensagem;
}

// Saídas aprovadas que ficaram DE FORA da remessa, cada uma com todos os motivos (o servidor repete as conferências do pagamento comum na hora de gerar:
// tutela, saldo do centro de custo, Fundo PDQ suspenso, dado bancário não confirmado/incompleto...). O texto vem do servidor: passa por escaparHtmlEbd.
function montarBarradosRemessa(barrados) {
  if (!Array.isArray(barrados) || barrados.length === 0) return "";
  let html = `<h4 style="margin:12px 0 4px; color: var(--cor-erro);">⚠️ ${barrados.length} Saída(s) aprovada(s) ficaram DE FORA da remessa</h4>
    <p class="subtitle">Nada foi enviado ao banco para elas. Resolva o motivo de cada uma e gere a remessa de novo.</p>
    <div class="rolagem-tabela"><table class="tabela-frequencia"><thead><tr><th>Saída</th><th>Fornecedor</th><th>Valor</th><th>Por que ficou de fora</th></tr></thead><tbody>`;
  barrados.forEach(b => {
    html += `<tr><td>#${escaparHtmlEbd(b.saidaId)}</td><td>${escaparHtmlEbd(b.fornecedorNome || "—")}</td><td>R$ ${Number(b.valor).toFixed(2)}</td>
      <td>${(b.motivos || []).map(m => "• " + escaparHtmlEbd(m.mensagem)).join("<br />")}</td></tr>`;
  });
  return html + "</tbody></table></div>";
}

async function gerarRemessaBancariaAcao() {
  const resultado = document.getElementById("resultadoNovaRemessa");
  const res = await fetchProtegido(`${API_BASE}/remessas-bancarias`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({})
  });
  const data = await res.json();
  avisarResultado(data);
  resultado.textContent = data.mensagem;
  document.getElementById("resultadoNovaRemessaBarrados").innerHTML = montarBarradosRemessa(data.barrados);
  if (data.sucesso) carregarRemessas();
}

function badgeStatusRemessa(status) {
  return `<span class="badge-status ${status === "PROCESSADA" ? "badge-ativo" : "badge-licenca"}">${escaparHtmlEbd(status)}</span>`;
}

async function carregarRemessas() {
  const container = document.getElementById("resultadoRemessas");
  const res = await fetchProtegido(`${API_BASE}/remessas-bancarias`);
  const remessas = await jsonDaTela(res, container, "lista");
  if (remessas === null) return;
  if (!Array.isArray(remessas) || remessas.length === 0) {
    container.innerHTML = "<p class='subtitle'>Nenhuma remessa gerada ainda.</p>";
    return;
  }
  let html = `<table class="tabela-frequencia"><thead><tr><th>Nº</th><th>Registros</th><th>Valor Total</th><th>Status</th><th></th></tr></thead><tbody>`;
  remessas.forEach(r => {
    html += `<tr>
      <td>${escaparHtmlEbd(r.numeroSequencial)}</td><td>${escaparHtmlEbd(r.totalRegistros)}</td><td>R$ ${Number(r.valorTotal).toFixed(2)}</td>
      <td>${badgeStatusRemessa(r.status)}${Number(r.divergentes) > 0 ? ` <span class="badge-status badge-desligado">${Number(r.divergentes)} divergência(s)</span>` : ""}</td>
      <td class="acoes-inline"><button class="btn-link" data-on-click="verDetalheRemessaAcao" data-args-click="${argsAttr(r.remessaId)}">Ver detalhe</button></td>
    </tr>`;
  });
  html += "</tbody></table>";
  container.innerHTML = html;
}

async function verDetalheRemessaAcao(remessaId) {
  const container = document.getElementById("detalheRemessa");
  const res = await fetchProtegido(`${API_BASE}/remessas-bancarias/${remessaId}`);
  const r = await jsonDaTela(res, container, "objeto");
  if (r === null) return;
  if (r.sucesso === false) { container.innerHTML = `<p class="subtitle">${escaparHtmlEbd(r.mensagem)}</p>`; return; }

  let html = `<hr /><h4>Remessa nº ${escaparHtmlEbd(r.numeroSequencial)} ${badgeStatusRemessa(r.status)}</h4>
    <p class="subtitle">R$ ${Number(r.valorTotal).toFixed(2)} em ${escaparHtmlEbd(r.totalRegistros)} pagamento(s) —
      <a href="${urlSegura(r.arquivoUrl)}" target="_blank" rel="noopener">📎 baixar arquivo de remessa</a>
      ${r.arquivoRetornoUrl ? ` — <a href="${urlSegura(r.arquivoRetornoUrl)}" target="_blank" rel="noopener">📎 arquivo de retorno</a>` : ""}</p>
    <table class="tabela-frequencia"><thead><tr><th>Fornecedor</th><th>Valor</th><th>Status</th></tr></thead><tbody>`;
  let temDivergencia = false;
  r.itens.forEach(i => {
    const mapa = { PENDENTE: "badge-licenca", PROCESSADO: "badge-ativo", FALHOU: "badge-desligado", DIVERGENTE: "badge-desligado" };
    // DIVERGENTE: o banco pagou (ocorrência "00"), mas a Saída deixou de passar nas conferências do pagamento comum — nada foi lançado como pago; a Tesouraria Geral trata aqui.
    let detalhe = "";
    if (i.motivos && i.motivos.length) detalhe = i.motivos.map(m => `<br /><small>• ${escaparHtmlEbd(m.mensagem)}</small>`).join("");
    else if (i.motivoFalha) detalhe = `<br /><small>${escaparHtmlEbd(i.motivoFalha)}</small>`;
    if (i.tratamentoResolucao) detalhe += `<br /><small>Tratado: ${i.tratamentoResolucao === "RECONHECER_PAGAMENTO" ? "pagamento reconhecido" : "item encerrado"} — ${escaparHtmlEbd(i.tratamentoObservacao || "")}</small>`;
    if (i.status === "DIVERGENTE") {
      temDivergencia = true;
      detalhe += `<br /><button class="btn-link" data-on-click="tratarDivergenciaRemessaAcao" data-args-click="${argsAttr(remessaId, i.remessaItemId, "RECONHECER_PAGAMENTO")}">Reconhecer pagamento</button>
        <button class="btn-link btn-link-perigo" data-on-click="tratarDivergenciaRemessaAcao" data-args-click="${argsAttr(remessaId, i.remessaItemId, "ENCERRAR")}">Encerrar item</button>`;
    }
    html += `<tr><td>${escaparHtmlEbd(i.fornecedorNome)}</td><td>R$ ${Number(i.valor).toFixed(2)}</td>
      <td><span class="badge-status ${mapa[i.status]}">${escaparHtmlEbd(i.status)}</span>${detalhe}</td></tr>`;
  });
  html += "</tbody></table>";
  if (temDivergencia) {
    html += `<p class="subtitle">⚠️ Itens DIVERGENTES: o banco já tratou o pagamento, mas ele não passa nas conferências de hoje (tutela, saldo, Fundo PDQ, dado bancário) ou o arquivo não informou o resultado.
      Confira o extrato do banco. <strong>Reconhecer pagamento</strong>: o dinheiro saiu — a Saída vira PAGA (fica a sua justificativa na auditoria). <strong>Encerrar item</strong>: o valor não saiu ou foi devolvido — a Saída volta a poder entrar numa remessa.</p>`;
  }

  if (r.status === "GERADA") {
    html += `
      <h4 style="margin:16px 0 8px; color: var(--cor-primaria);">Processar retorno do banco</h4>
      <div class="input-group">
        <input type="file" id="arquivoRetornoRemessa_${remessaId}" />
      </div>
      <button class="btn-confirmar" style="width:auto;" data-on-click="processarRetornoRemessaAcao" data-args-click="${argsAttr(remessaId)}">Processar Retorno</button>
      <p id="resultadoRetornoRemessa_${remessaId}" class="subtitle"></p>`;
  }
  container.innerHTML = html;
}

async function processarRetornoRemessaAcao(remessaId) {
  const arquivo = document.getElementById(`arquivoRetornoRemessa_${remessaId}`).files[0];
  const resultado = document.getElementById(`resultadoRetornoRemessa_${remessaId}`);
  if (!arquivo) { resultado.textContent = "Anexe o arquivo de retorno recebido do banco."; return; }
  const body = { arquivoRetornoBase64: await arquivoParaBase64(arquivo), mimeType: arquivo.type || "text/plain" };
  const res = await fetchProtegido(`${API_BASE}/remessas-bancarias/${remessaId}/retorno`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body)
  });
  const data = await res.json();
  avisarResultado(data);
  resultado.textContent = data.mensagem;
  if (data.sucesso) { verDetalheRemessaAcao(remessaId); carregarRemessas(); carregarSaidas(); }
}

// Tratar um item DIVERGENTE do retorno: reconhecer que o dinheiro saiu (a Saída vira PAGA) ou encerrar o item. A justificativa é obrigatória e vai para a auditoria.
async function tratarDivergenciaRemessaAcao(remessaId, remessaItemId, resolucao) {
  const titulo = resolucao === "RECONHECER_PAGAMENTO"
    ? "O que você conferiu? (o banco pagou: a Saída vai virar PAGA)"
    : "Por que encerrar este item? (ex.: o banco devolveu o valor em dd/mm)";
  const observacao = await pedirTexto(titulo, "Mínimo de 5 caracteres");
  if (observacao === null) return;
  const res = await fetchProtegido(`${API_BASE}/remessas-bancarias/${remessaId}`, {
    method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ acao: "TRATAR_DIVERGENCIA", remessaItemId, resolucao, observacao })
  });
  const data = await res.json();
  avisarResultado(data);
  if (data.sucesso) { verDetalheRemessaAcao(remessaId); carregarRemessas(); carregarSaidas(); }
}

// ---- ORÇAMENTO ANUAL, ORÇADO VS REALIZADO E FLUXO DE CAIXA PROJETADO
// (v4.8, primeira parte) — Empenhado/Realizado sempre calculados na
// leitura a partir das Saídas/Lançamentos de verdade, nunca digitados à
// mão. Balanço Patrimonial fica pra v4.9 (Demonstrações Contábeis).
function alternarFormNovoOrcamento() {
  const form = document.getElementById("formNovoOrcamento");
  const abrindo = form.style.display === "none";
  form.style.display = abrindo ? "block" : "none";
  if (abrindo) montarBuilderLinhasOrcamento();
}

function montarBuilderLinhasOrcamento() {
  const entradas = (_categoriasEntradaCache || []).filter(c => c.ativa !== false);
  const saidas = (_categoriasSaidaCache || []).filter(c => c.ativa !== false);
  const linha = c => `<tr>
      <td><input type="checkbox" class="chk-linha-orcamento" data-tipo="${escaparHtmlEbd(c._tipo)}" value="${escaparHtmlEbd(c.codigo)}" /></td>
      <td>${escaparHtmlEbd(c.nome)}</td>
      <td><input type="number" class="valor-linha-orcamento" min="0.01" step="0.01" style="max-width:130px;" placeholder="0,00" /></td>
    </tr>`;
  entradas.forEach(c => c._tipo = "ENTRADA");
  saidas.forEach(c => c._tipo = "SAIDA");
  document.getElementById("orcamentoLinhasEntrada").innerHTML = `<table class="tabela-frequencia"><thead><tr><th></th><th>Categoria</th><th>Valor Orçado (R$)</th></tr></thead><tbody>${entradas.map(linha).join("")}</tbody></table>`;
  document.getElementById("orcamentoLinhasSaida").innerHTML = `<table class="tabela-frequencia"><thead><tr><th></th><th>Categoria</th><th>Valor Orçado (R$)</th></tr></thead><tbody>${saidas.map(linha).join("")}</tbody></table>`;
}

async function criarOrcamentoAcao() {
  const ano = document.getElementById("orcamentoAno").value;
  const resultado = document.getElementById("resultadoNovoOrcamento");
  if (!ano) { resultado.textContent = "Informe o ano."; return; }
  const linhas = [];
  document.querySelectorAll(".chk-linha-orcamento:checked").forEach(chk => {
    const valor = chk.closest("tr").querySelector(".valor-linha-orcamento").value;
    if (valor && Number(valor) > 0) linhas.push({ tipoMovimento: chk.dataset.tipo, categoriaCodigo: chk.value, valorOrcado: Number(valor) });
  });
  if (linhas.length === 0) { resultado.textContent = "Marque ao menos uma categoria e informe o valor orçado."; return; }

  const res = await fetchProtegido(`${API_BASE}/orcamentos`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ano: Number(ano), linhas })
  });
  const data = await res.json();
  avisarResultado(data);
  resultado.textContent = data.mensagem;
  if (data.sucesso) {
    document.getElementById("orcamentoAno").value = "";
    document.getElementById("formNovoOrcamento").style.display = "none";
    carregarOrcamentos();
  }
}

async function carregarOrcamentos() {
  const container = document.getElementById("resultadoOrcamentos");
  const res = await fetchProtegido(`${API_BASE}/orcamentos`);
  const orcamentos = await jsonDaTela(res, container, "lista");
  if (orcamentos === null) return;
  if (!Array.isArray(orcamentos) || orcamentos.length === 0) {
    container.innerHTML = "<p class='subtitle'>Nenhum orçamento anual cadastrado ainda.</p>";
    return;
  }
  let html = `<table class="tabela-frequencia"><thead><tr><th>Ano</th><th>Orçado (Entradas)</th><th>Orçado (Saídas)</th><th>Status</th><th></th></tr></thead><tbody>`;
  orcamentos.forEach(o => {
    html += `<tr>
      <td>${escaparHtmlEbd(o.ano)}</td><td>R$ ${Number(o.totalOrcadoEntrada).toFixed(2)}</td><td>R$ ${Number(o.totalOrcadoSaida).toFixed(2)}</td>
      <td><span class="badge-status ${o.status === "ABERTO" ? "badge-ativo" : "badge-inativo"}">${escaparHtmlEbd(o.status)}</span></td>
      <td class="acoes-inline"><button class="btn-link" data-on-click="verDetalheOrcamentoAcao" data-args-click="${argsAttr(o.orcamentoId)}">Ver detalhe</button></td>
    </tr>`;
  });
  html += "</tbody></table>";
  container.innerHTML = html;
}

async function verDetalheOrcamentoAcao(orcamentoId) {
  const container = document.getElementById("detalheOrcamento");
  const res = await fetchProtegido(`${API_BASE}/orcamentos/${orcamentoId}`);
  const o = await jsonDaTela(res, container, "objeto");
  if (o === null) return;
  if (o.sucesso === false) { container.innerHTML = `<p class="subtitle">${escaparHtmlEbd(o.mensagem)}</p>`; return; }

  let html = `<hr /><h4>Orçamento ${escaparHtmlEbd(o.ano)} — <span class="badge-status ${o.status === "ABERTO" ? "badge-ativo" : "badge-inativo"}">${escaparHtmlEbd(o.status)}</span></h4>`;
  if (authGeral && o.status === "ABERTO") {
    html += `<button class="btn-link btn-link-perigo" data-on-click="encerrarOrcamentoAcao" data-args-click="${argsAttr(orcamentoId)}">🔒 Encerrar orçamento</button>`;
  }
  html += `<table class="tabela-frequencia"><thead><tr><th>Tipo</th><th>Categoria</th><th>Orçado</th><th>Empenhado</th><th>Realizado</th></tr></thead><tbody>`;
  o.linhas.forEach(l => {
    html += `<tr>
      <td>${l.tipoMovimento === "ENTRADA" ? "Entrada" : "Saída"}</td><td>${escaparHtmlEbd(l.categoriaNome) || escaparHtmlEbd(l.categoriaCodigo)}</td>
      <td>R$ ${Number(l.valorOrcado).toFixed(2)}</td><td>${l.empenhado != null ? "R$ " + Number(l.empenhado).toFixed(2) : "—"}</td>
      <td>R$ ${Number(l.realizado).toFixed(2)}</td>
    </tr>`;
  });
  html += "</tbody></table>";
  container.innerHTML = html;
}

async function encerrarOrcamentoAcao(orcamentoId) {
  const motivo = await pedirTexto("Confirma encerrar este orçamento?", "Digite qualquer texto para confirmar");
  if (motivo === null) return;
  const res = await fetchProtegido(`${API_BASE}/orcamentos/${orcamentoId}`, {
    method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "ENCERRADO" })
  });
  const data = await res.json();
  avisarResultado(data);
  if (data.sucesso) { carregarOrcamentos(); verDetalheOrcamentoAcao(orcamentoId); }
}

function alternarCongregacaoFluxoCaixa() {
  const centroCusto = document.getElementById("fluxoCentroCusto").value;
  document.getElementById("fluxoCongregacao").style.display = centroCusto === "LOCAL" ? "inline-block" : "none";
}

async function carregarFluxoCaixaProjetadoAcao() {
  const centroCusto = document.getElementById("fluxoCentroCusto").value;
  const congregacaoId = document.getElementById("fluxoCongregacao").value;
  const meses = document.getElementById("fluxoMeses").value || 6;
  const container = document.getElementById("resultadoFluxoCaixaProjetado");
  const params = new URLSearchParams({ centroCusto, meses });
  if (centroCusto === "LOCAL") {
    if (!congregacaoId) { container.innerHTML = "<p class='subtitle'>Escolha a congregação.</p>"; return; }
    params.set("congregacaoId", congregacaoId);
  }
  const res = await fetchProtegido(`${API_BASE}/fluxo-caixa-projetado?${params.toString()}`);
  const data = await jsonDaTela(res, container, "objeto");
  if (data === null) return;
  if (data.sucesso === false) { container.innerHTML = `<p class="subtitle">${escaparHtmlEbd(data.mensagem)}</p>`; return; }

  let html = `<p class="subtitle">Saldo atual: R$ ${Number(data.saldoAtual).toFixed(2)} — entrada média mensal: R$ ${Number(data.entradaMediaMensal).toFixed(2)}
    — saída média mensal: R$ ${Number(data.saidaMediaMensal).toFixed(2)} — empenhado em aberto: R$ ${Number(data.totalEmpenhadoAberto).toFixed(2)}</p>
    <table class="tabela-frequencia"><thead><tr><th>Mês</th><th>Entrada Projetada</th><th>Saída Projetada</th><th>Empenho</th><th>Saldo Projetado</th></tr></thead><tbody>`;
  data.projecao.forEach(p => {
    html += `<tr>
      <td>${escaparHtmlEbd(p.mesReferencia)}</td><td>R$ ${Number(p.entradaProjetada).toFixed(2)}</td><td>R$ ${Number(p.saidaProjetada).toFixed(2)}</td>
      <td>R$ ${Number(p.empenhoAberto).toFixed(2)}</td>
      <td style="${p.saldoProjetado < 0 ? "color: var(--cor-erro); font-weight:600;" : ""}">R$ ${Number(p.saldoProjetado).toFixed(2)}</td>
    </tr>`;
  });
  html += "</tbody></table>";
  container.innerHTML = html;
}

// ---- PDQ: PLANEJAMENTO DIRETOR QUADRIENAL (v4.8, segunda parte) — plano
// com 3 eixos, metas por eixo, projetos por meta (cronograma físico/
// financeiro, atraso calculado sozinho), remanejamento com cláusula de
// barreira (Art. 28) e Fundo de Execução Estratégica (Art. 27).
let _pdqPlanoDetalheCache = null;

function alternarFormNovoPlanoPdq() {
  const form = document.getElementById("formNovoPlanoPdq");
  form.style.display = form.style.display === "none" ? "block" : "none";
}

async function criarPlanoPdqAcao() {
  const anoInicio = document.getElementById("pdqAnoInicio").value;
  const anoFim = document.getElementById("pdqAnoFim").value;
  const titulo = document.getElementById("pdqTitulo").value.trim();
  const eixos = [1, 2, 3].map(n => ({ nome: document.getElementById(`pdqEixo${n}`).value.trim() }));
  const resultado = document.getElementById("resultadoNovoPlanoPdq");
  if (!anoInicio || !anoFim || !titulo || eixos.some(e => !e.nome)) {
    resultado.textContent = "Preencha o período, o título e os 3 eixos.";
    return;
  }
  const res = await fetchProtegido(`${API_BASE}/pdq-planos`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ anoInicio: Number(anoInicio), anoFim: Number(anoFim), titulo, eixos })
  });
  const data = await res.json();
  avisarResultado(data);
  resultado.textContent = data.mensagem;
  if (data.sucesso) {
    ["pdqAnoInicio", "pdqAnoFim", "pdqTitulo", "pdqEixo1", "pdqEixo2", "pdqEixo3"].forEach(id => document.getElementById(id).value = "");
    document.getElementById("formNovoPlanoPdq").style.display = "none";
    carregarPlanosPdq();
  }
}

async function carregarPlanosPdq() {
  const container = document.getElementById("resultadoPlanosPdq");
  const res = await fetchProtegido(`${API_BASE}/pdq-planos`);
  const planos = await jsonDaTela(res, container, "lista");
  if (planos === null) return;
  if (!Array.isArray(planos) || planos.length === 0) {
    container.innerHTML = "<p class='subtitle'>Nenhum Plano PDQ cadastrado ainda.</p>";
    return;
  }
  let html = `<table class="tabela-frequencia"><thead><tr><th>Período</th><th>Título</th><th>Eixos</th><th>Metas</th><th>Status</th><th></th></tr></thead><tbody>`;
  planos.forEach(p => {
    html += `<tr>
      <td>${escaparHtmlEbd(p.anoInicio)}-${escaparHtmlEbd(p.anoFim)}</td><td>${escaparHtmlEbd(p.titulo)}</td><td>${escaparHtmlEbd(p.totalEixos)}</td><td>${escaparHtmlEbd(p.totalMetas)}</td>
      <td><span class="badge-status ${p.status === "VIGENTE" ? "badge-ativo" : (p.status === "ENCERRADO" ? "badge-inativo" : "badge-licenca")}">${escaparHtmlEbd(p.status)}</span></td>
      <td class="acoes-inline"><button class="btn-link" data-on-click="verDetalhePlanoPdqAcao" data-args-click="${argsAttr(p.planoId)}">Ver detalhe</button></td>
    </tr>`;
  });
  html += "</tbody></table>";
  container.innerHTML = html;
}

function badgeStatusPdqMeta(status) {
  const mapa = { EM_ANDAMENTO: "badge-licenca", CUMPRIDA: "badge-ativo", NAO_CUMPRIDA: "badge-desligado" };
  return `<span class="badge-status ${mapa[status]}">${escaparHtmlEbd(status.replace("_", " "))}</span>`;
}

async function verDetalhePlanoPdqAcao(planoId) {
  const container = document.getElementById("detalhePlanoPdq");
  const res = await fetchProtegido(`${API_BASE}/pdq-planos/${planoId}`);
  const p = await jsonDaTela(res, container, "objeto");
  if (p === null) return;
  if (p.sucesso === false) { container.innerHTML = `<p class="subtitle">${escaparHtmlEbd(p.mensagem)}</p>`; return; }
  _pdqPlanoDetalheCache = p;

  let html = `<hr /><h4>${escaparHtmlEbd(p.titulo)} (${escaparHtmlEbd(p.anoInicio)}-${escaparHtmlEbd(p.anoFim)}) — <span class="badge-status ${p.status === "VIGENTE" ? "badge-ativo" : "badge-inativo"}">${escaparHtmlEbd(p.status)}</span></h4>`;
  if (p.status !== "ENCERRADO") {
    html += `<select id="pdqStatusPlano_${planoId}">
        <option value="EM_ELABORACAO" ${p.status === "EM_ELABORACAO" ? "selected" : ""}>Em elaboração</option>
        <option value="VIGENTE" ${p.status === "VIGENTE" ? "selected" : ""}>Vigente</option>
        <option value="ENCERRADO">Encerrado</option>
      </select>
      <button class="btn-link" data-on-click="atualizarStatusPlanoPdqAcao" data-args-click="${argsAttr(planoId)}">Salvar status</button>
      <button class="btn-link" data-on-click="verRelatorioProgressoPdqAcao" data-args-click="${argsAttr(planoId)}">📊 Relatório de Progresso (AGO)</button>`;
  }
  html += `<div id="resultadoRelatorioProgressoPdq" style="margin:10px 0;"></div>`;

  p.eixos.forEach(eixo => {
    html += `<div style="border:1px solid #e0e0e0; border-radius:8px; padding:12px; margin-top:12px;">
      <h4 style="margin:0 0 6px; color: var(--cor-primaria);">📍 ${escaparHtmlEbd(eixo.nome)}</h4>`;
    eixo.metas.forEach(meta => {
      html += `<div style="margin:10px 0 10px 14px; padding-left:10px; border-left:3px solid #ddd;">
        <strong>${escaparHtmlEbd(meta.descricao)}</strong> ${badgeStatusPdqMeta(meta.status)} ${meta.indicador ? `<br /><small>Indicador: ${escaparHtmlEbd(meta.indicador)}</small>` : ""} <small>— prazo ${escaparHtmlEbd(meta.prazoAno)}</small>
        ${meta.justificativaTecnica ? `<br /><small>Justificativa: ${escaparHtmlEbd(meta.justificativaTecnica)}</small>` : ""}
        <div class="barra-lista" style="margin-top:6px;">
          <select id="pdqStatusMeta_${meta.metaId}">
            <option value="EM_ANDAMENTO" ${meta.status === "EM_ANDAMENTO" ? "selected" : ""}>Em andamento</option>
            <option value="CUMPRIDA" ${meta.status === "CUMPRIDA" ? "selected" : ""}>Cumprida</option>
            <option value="NAO_CUMPRIDA" ${meta.status === "NAO_CUMPRIDA" ? "selected" : ""}>Não cumprida</option>
          </select>
          <button class="btn-link" data-on-click="atualizarStatusMetaPdqAcao" data-args-click="${argsAttr(meta.metaId)}">Salvar</button>
        </div>`;
      meta.projetos.forEach(proj => {
        html += `<div style="margin:8px 0 8px 14px; padding:8px; background:#f7f7f7; border-radius:6px;">
          <strong>${escaparHtmlEbd(proj.nome)}</strong> — R$ ${Number(proj.orcamentoPrevisto).toFixed(2)}
          <span class="badge-status ${proj.status === "CONCLUIDO" ? "badge-ativo" : (proj.status === "CANCELADO" ? "badge-inativo" : "badge-licenca")}">${escaparHtmlEbd(proj.status)}</span>
          ${proj.atrasado ? "<span class='badge-status badge-desligado'>ATRASADO</span>" : ""}
          <br /><small>${escaparHtmlEbd(proj.cronogramaInicio)} até ${escaparHtmlEbd(proj.cronogramaFim)}</small>
          <div class="barra-lista" style="margin-top:4px;">
            <select id="pdqStatusProjeto_${proj.projetoId}">
              <option value="PLANEJADO" ${proj.status === "PLANEJADO" ? "selected" : ""}>Planejado</option>
              <option value="EM_EXECUCAO" ${proj.status === "EM_EXECUCAO" ? "selected" : ""}>Em execução</option>
              <option value="CONCLUIDO" ${proj.status === "CONCLUIDO" ? "selected" : ""}>Concluído</option>
              <option value="CANCELADO" ${proj.status === "CANCELADO" ? "selected" : ""}>Cancelado</option>
            </select>
            <button class="btn-link" data-on-click="atualizarStatusProjetoPdqAcao" data-args-click="${argsAttr(proj.projetoId)}">Salvar</button>
            ${authGeral ? `<button class="btn-link" data-on-click="solicitarRemanejamentoPdqAcao" data-args-click="${argsAttr(proj.projetoId)}">↔️ Remanejar orçamento</button>` : ""}
          </div>
        </div>`;
      });
      html += `<button class="btn-link" data-on-click="alternarFormNovoProjetoPdq" data-args-click="${argsAttr(meta.metaId)}">➕ Novo projeto nesta meta</button>
        <div id="formNovoProjetoPdq_${meta.metaId}" style="display:none; margin:6px 0 6px 14px;">
          <div class="barra-lista">
            <input type="text" id="pdqProjetoNome_${meta.metaId}" placeholder="Nome do projeto" />
            <input type="number" id="pdqProjetoOrcamento_${meta.metaId}" placeholder="Orçamento previsto (R$)" min="0.01" step="0.01" style="max-width:170px;" />
          </div>
          <div class="barra-lista">
            <input type="date" id="pdqProjetoInicio_${meta.metaId}" />
            <input type="date" id="pdqProjetoFim_${meta.metaId}" />
          </div>
          <button class="btn-confirmar" style="width:auto;" data-on-click="criarProjetoPdqAcao" data-args-click="${argsAttr(meta.metaId)}">Criar Projeto</button>
          <p id="resultadoNovoProjetoPdq_${meta.metaId}" class="subtitle"></p>
        </div>`;
      html += `</div>`;
    });
    html += `<button class="btn-link" data-on-click="alternarFormNovaMetaPdq" data-args-click="${argsAttr(eixo.eixoId)}">➕ Nova meta neste eixo</button>
      <div id="formNovaMetaPdq_${eixo.eixoId}" style="display:none; margin:6px 0;">
        <div class="input-group"><input type="text" id="pdqMetaDescricao_${eixo.eixoId}" placeholder="Descrição da meta" /></div>
        <div class="barra-lista">
          <input type="text" id="pdqMetaIndicador_${eixo.eixoId}" placeholder="Indicador (opcional)" />
          <input type="number" id="pdqMetaPrazoAno_${eixo.eixoId}" placeholder="Ano prazo" style="max-width:130px;" />
        </div>
        <button class="btn-confirmar" style="width:auto;" data-on-click="criarMetaPdqAcao" data-args-click="${argsAttr(eixo.eixoId)}">Criar Meta</button>
        <p id="resultadoNovaMetaPdq_${eixo.eixoId}" class="subtitle"></p>
      </div>`;
    html += `</div>`;
  });

  html += `<div id="resultadoRemanejamentosPdq" style="margin-top:14px;"></div>`;
  container.innerHTML = html;
}

async function atualizarStatusPlanoPdqAcao(planoId) {
  const status = document.getElementById(`pdqStatusPlano_${planoId}`).value;
  const res = await fetchProtegido(`${API_BASE}/pdq-planos/${planoId}`, {
    method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status })
  });
  const data = await res.json();
  avisarResultado(data);
  if (data.sucesso) { carregarPlanosPdq(); verDetalhePlanoPdqAcao(planoId); }
}

function alternarFormNovaMetaPdq(eixoId) {
  const form = document.getElementById(`formNovaMetaPdq_${eixoId}`);
  form.style.display = form.style.display === "none" ? "block" : "none";
}

async function criarMetaPdqAcao(eixoId) {
  const descricao = document.getElementById(`pdqMetaDescricao_${eixoId}`).value.trim();
  const indicador = document.getElementById(`pdqMetaIndicador_${eixoId}`).value.trim();
  const prazoAno = document.getElementById(`pdqMetaPrazoAno_${eixoId}`).value;
  const resultado = document.getElementById(`resultadoNovaMetaPdq_${eixoId}`);
  if (!descricao || !prazoAno) { resultado.textContent = "Informe a descrição e o ano prazo."; return; }
  const res = await fetchProtegido(`${API_BASE}/pdq-metas`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ eixoId, descricao, indicador: indicador || undefined, prazoAno: Number(prazoAno) })
  });
  const data = await res.json();
  avisarResultado(data);
  resultado.textContent = data.mensagem;
  if (data.sucesso) verDetalhePlanoPdqAcao(_pdqPlanoDetalheCache.planoId);
}

async function atualizarStatusMetaPdqAcao(metaId) {
  const status = document.getElementById(`pdqStatusMeta_${metaId}`).value;
  let justificativaTecnica;
  if (status === "NAO_CUMPRIDA") {
    justificativaTecnica = await pedirTexto("Justificativa técnica (Art. 29 §1º) — obrigatória", "Por que a meta não foi cumprida?");
    if (justificativaTecnica === null || !justificativaTecnica.trim()) { mostrarToast("Justificativa técnica é obrigatória pra marcar como não cumprida.", "erro"); return; }
  }
  const res = await fetchProtegido(`${API_BASE}/pdq-metas/${metaId}`, {
    method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status, justificativaTecnica })
  });
  const data = await res.json();
  avisarResultado(data);
  if (data.sucesso) verDetalhePlanoPdqAcao(_pdqPlanoDetalheCache.planoId);
}

function alternarFormNovoProjetoPdq(metaId) {
  const form = document.getElementById(`formNovoProjetoPdq_${metaId}`);
  form.style.display = form.style.display === "none" ? "block" : "none";
}

async function criarProjetoPdqAcao(metaId) {
  const nome = document.getElementById(`pdqProjetoNome_${metaId}`).value.trim();
  const orcamentoPrevisto = document.getElementById(`pdqProjetoOrcamento_${metaId}`).value;
  const cronogramaInicio = document.getElementById(`pdqProjetoInicio_${metaId}`).value;
  const cronogramaFim = document.getElementById(`pdqProjetoFim_${metaId}`).value;
  const resultado = document.getElementById(`resultadoNovoProjetoPdq_${metaId}`);
  if (!nome || !orcamentoPrevisto || !cronogramaInicio || !cronogramaFim) {
    resultado.textContent = "Preencha nome, orçamento e o cronograma completo.";
    return;
  }
  const res = await fetchProtegido(`${API_BASE}/pdq-projetos`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ metaId, nome, orcamentoPrevisto: Number(orcamentoPrevisto), cronogramaInicio, cronogramaFim })
  });
  const data = await res.json();
  avisarResultado(data);
  resultado.textContent = data.mensagem;
  if (data.sucesso) verDetalhePlanoPdqAcao(_pdqPlanoDetalheCache.planoId);
}

async function atualizarStatusProjetoPdqAcao(projetoId) {
  const status = document.getElementById(`pdqStatusProjeto_${projetoId}`).value;
  const res = await fetchProtegido(`${API_BASE}/pdq-projetos/${projetoId}`, {
    method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status })
  });
  const data = await res.json();
  avisarResultado(data);
  if (data.sucesso) verDetalhePlanoPdqAcao(_pdqPlanoDetalheCache.planoId);
}

function listaTodosProjetosPdq() {
  if (!_pdqPlanoDetalheCache) return [];
  const lista = [];
  _pdqPlanoDetalheCache.eixos.forEach(eixo => eixo.metas.forEach(meta => meta.projetos.forEach(proj => lista.push(proj))));
  return lista;
}

async function solicitarRemanejamentoPdqAcao(projetoOrigemId) {
  const projetos = listaTodosProjetosPdq().filter(p => p.projetoId !== projetoOrigemId);
  if (projetos.length === 0) { mostrarToast("Não há outro projeto no plano pra remanejar.", "erro"); return; }
  const nomesDisponiveis = projetos.map(p => `${p.projetoId} — ${p.nome}`).join("\n");
  const destinoTexto = await pedirTexto(`ID do projeto de destino:\n${nomesDisponiveis}`, "Digite o número do ID");
  if (destinoTexto === null) return;
  const projetoDestinoId = parseInt(destinoTexto, 10);
  if (!projetos.some(p => p.projetoId === projetoDestinoId)) { mostrarToast("ID de destino inválido.", "erro"); return; }
  const valorTexto = await pedirTexto("Valor a remanejar (R$)", "Ex: 500.00");
  if (valorTexto === null) return;
  const valor = Number(valorTexto);
  if (!valor || valor <= 0) { mostrarToast("Valor inválido.", "erro"); return; }

  const res = await fetchProtegido(`${API_BASE}/pdq-remanejamentos`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ projetoOrigemId, projetoDestinoId, valor })
  });
  const data = await res.json();
  avisarResultado(data);
  if (data.sucesso && data.status === "PENDENTE_CLI") {
    const container = document.getElementById("resultadoRemanejamentosPdq");
    container.innerHTML = `<p class="subtitle">${escaparHtmlEbd(data.mensagem)}</p>
      <button class="btn-link" data-on-click="homologarRemanejamentoPdqAcao" data-args-click="${argsAttr(data.remanejamentoId)}">✅ Homologar (CLI)</button>
      <button class="btn-link btn-link-perigo" data-on-click="rejeitarRemanejamentoPdqAcao" data-args-click="${argsAttr(data.remanejamentoId)}">Rejeitar (CLI)</button>`;
  } else if (data.sucesso) {
    verDetalhePlanoPdqAcao(_pdqPlanoDetalheCache.planoId);
  }
}

async function homologarRemanejamentoPdqAcao(remanejamentoId) {
  const res = await fetchProtegido(`${API_BASE}/pdq-remanejamentos/${remanejamentoId}`, {
    method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ acao: "HOMOLOGAR" })
  });
  const data = await res.json();
  avisarResultado(data);
  if (data.sucesso) verDetalhePlanoPdqAcao(_pdqPlanoDetalheCache.planoId);
}

async function rejeitarRemanejamentoPdqAcao(remanejamentoId) {
  const motivo = await pedirTexto("Motivo da rejeição (CLI)", "Ex: sem justificativa suficiente");
  if (motivo === null || !motivo.trim()) return;
  const res = await fetchProtegido(`${API_BASE}/pdq-remanejamentos/${remanejamentoId}`, {
    method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ acao: "REJEITAR", motivo })
  });
  const data = await res.json();
  avisarResultado(data);
  if (data.sucesso) verDetalhePlanoPdqAcao(_pdqPlanoDetalheCache.planoId);
}

async function verRelatorioProgressoPdqAcao(planoId) {
  const container = document.getElementById("resultadoRelatorioProgressoPdq");
  const res = await fetchProtegido(`${API_BASE}/pdq-relatorio-progresso/${planoId}`);
  const r = await jsonDaTela(res, container, "objeto");
  if (r === null) return;
  if (r.sucesso === false) { container.innerHTML = `<p class="subtitle">${escaparHtmlEbd(r.mensagem)}</p>`; return; }
  let html = `<div style="border:1px solid var(--cor-primaria); border-radius:8px; padding:10px;">
    <strong>Progresso geral: ${escaparHtmlEbd(r.percentualCumprimentoGeral)}%</strong> (${escaparHtmlEbd(r.totalCumpridas)} de ${escaparHtmlEbd(r.totalMetas)} metas cumpridas)<br />`;
  r.eixos.forEach(e => {
    html += `${escaparHtmlEbd(e.nome)}: ${escaparHtmlEbd(e.percentualCumprimento)}% (${escaparHtmlEbd(e.metasCumpridas)} cumprida(s), ${escaparHtmlEbd(e.metasNaoCumpridas)} não cumprida(s), ${escaparHtmlEbd(e.metasEmAndamento)} em andamento) —
      orçado em projetos: R$ ${Number(e.totalOrcadoProjetos).toFixed(2)}${e.projetosAtrasados.length > 0 ? ` — ⚠️ ${e.projetosAtrasados.length} projeto(s) atrasado(s)` : ""}<br />`;
  });
  html += "</div>";
  container.innerHTML = html;
}

async function carregarFundoExecucaoPdq() {
  const container = document.getElementById("resultadoFundoExecucaoPdq");
  const res = await fetchProtegido(`${API_BASE}/pdq-fundo-execucao`);
  const f = await jsonDaTela(res, container, "objeto");
  if (f === null) return;
  let html = `<p class="subtitle">Dotação: ${escaparHtmlEbd(f.percentualDotacao)}% da arrecadação líquida da Geral — saldo disponível: <strong>R$ ${Number(f.saldoDisponivel).toFixed(2)}</strong></p>`;
  if (f.suspenso) {
    html += `<p class="subtitle">⚠️ <strong>Suspenso</strong> desde ${new Date(f.suspensao.suspensoEm).toLocaleDateString("pt-BR")} — motivo: ${escaparHtmlEbd(f.suspensao.motivoSuspensao)}</p>`;
  }
  container.innerHTML = html;
}

async function suspenderFundoPdqAcao() {
  const motivo = document.getElementById("fundoPdqMotivo").value.trim();
  const resultado = document.getElementById("resultadoAcaoFundoPdq");
  if (!motivo) { resultado.textContent = "Informe o motivo."; return; }
  const res = await fetchProtegido(`${API_BASE}/pdq-fundo-execucao`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ acao: "SUSPENDER", motivo })
  });
  const data = await res.json();
  avisarResultado(data);
  resultado.textContent = data.mensagem;
  if (data.sucesso) { document.getElementById("fundoPdqMotivo").value = ""; carregarFundoExecucaoPdq(); }
}

async function reativarFundoPdqAcao() {
  const motivo = document.getElementById("fundoPdqMotivo").value.trim();
  const resultado = document.getElementById("resultadoAcaoFundoPdq");
  if (!motivo) { resultado.textContent = "Informe o motivo."; return; }
  const res = await fetchProtegido(`${API_BASE}/pdq-fundo-execucao`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ acao: "REATIVAR", motivo })
  });
  const data = await res.json();
  avisarResultado(data);
  resultado.textContent = data.mensagem;
  if (data.sucesso) { document.getElementById("fundoPdqMotivo").value = ""; carregarFundoExecucaoPdq(); }
}

// ---- DEMONSTRAÇÕES CONTÁBEIS (v4.9, ITG 2002) — Balanço Patrimonial,
// DRP (regime de competência), Mutações do PL e Fluxo de Caixa, todos
// calculados na leitura; Notas Explicativas é o único texto editável.
function alternarCamposDemonstracao() {
  const tipo = document.getElementById("demonstracaoTipo").value;
  document.getElementById("demonstracaoDataCorte").style.display = tipo === "balanco" ? "inline-block" : "none";
  document.getElementById("demonstracaoDataInicio").style.display = tipo === "balanco" ? "none" : "inline-block";
  document.getElementById("demonstracaoDataFim").style.display = tipo === "balanco" ? "none" : "inline-block";
}

async function gerarDemonstracaoAcao() {
  const tipo = document.getElementById("demonstracaoTipo").value;
  const container = document.getElementById("resultadoDemonstracao");
  const params = new URLSearchParams({ tipo });
  if (tipo === "balanco") {
    const dataCorte = document.getElementById("demonstracaoDataCorte").value;
    if (!dataCorte) { container.innerHTML = "<p class='subtitle'>Escolha a data de corte.</p>"; return; }
    params.set("dataCorte", dataCorte);
  } else {
    const dataInicio = document.getElementById("demonstracaoDataInicio").value;
    const dataFim = document.getElementById("demonstracaoDataFim").value;
    if (!dataInicio || !dataFim) { container.innerHTML = "<p class='subtitle'>Escolha o período (início e fim).</p>"; return; }
    params.set("dataInicio", dataInicio);
    params.set("dataFim", dataFim);
  }
  const res = await fetchProtegido(`${API_BASE}/demonstracoes-contabeis?${params.toString()}`);
  const d = await jsonDaTela(res, container, "objeto");
  if (d === null) return;
  if (d.sucesso === false) { container.innerHTML = `<p class="subtitle">${escaparHtmlEbd(d.mensagem)}</p>`; return; }

  if (tipo === "balanco") {
    container.innerHTML = `<h4>Balanço Patrimonial em ${d.dataCorte ? new Date(d.dataCorte).toLocaleDateString("pt-BR") : ""}</h4>
      <table class="tabela-frequencia"><tbody>
        <tr><td colspan="2"><strong>ATIVO</strong></td></tr>
        <tr><td>Caixa e Equivalentes</td><td>R$ ${Number(d.ativo.caixaEEquivalentes).toFixed(2)}</td></tr>
        <tr><td>Contas a Receber</td><td>R$ ${Number(d.ativo.contasAReceber).toFixed(2)}</td></tr>
        <tr><td><strong>Total do Ativo</strong></td><td><strong>R$ ${Number(d.ativo.total).toFixed(2)}</strong></td></tr>
        <tr><td colspan="2"><strong>PASSIVO</strong></td></tr>
        <tr><td>Contas a Pagar</td><td>R$ ${Number(d.passivo.contasAPagar).toFixed(2)}</td></tr>
        <tr><td><strong>Total do Passivo</strong></td><td><strong>R$ ${Number(d.passivo.total).toFixed(2)}</strong></td></tr>
        <tr><td><strong>Patrimônio Líquido</strong></td><td><strong>R$ ${Number(d.patrimonioLiquido).toFixed(2)}</strong></td></tr>
      </tbody></table>`;
    return;
  }

  if (tipo === "drp") {
    let html = `<h4>Demonstração do Resultado do Período (${escaparHtmlEbd(d.dataInicio.slice(0, 10))} a ${escaparHtmlEbd(d.dataFim.slice(0, 10))})</h4>
      <table class="tabela-frequencia"><thead><tr><th>Categoria</th><th>Valor</th></tr></thead><tbody>
        <tr><td colspan="2"><strong>RECEITAS</strong></td></tr>`;
    d.receitas.forEach(r => html += `<tr><td>${escaparHtmlEbd(r.categoriaNome) || escaparHtmlEbd(r.categoriaCodigo)}</td><td>R$ ${Number(r.total).toFixed(2)}</td></tr>`);
    html += `<tr><td><strong>Total de Receitas</strong></td><td><strong>R$ ${Number(d.totalReceitas).toFixed(2)}</strong></td></tr>
      <tr><td colspan="2"><strong>DESPESAS</strong></td></tr>`;
    d.despesas.forEach(dd => html += `<tr><td>${escaparHtmlEbd(dd.categoriaNome)} ${dd.classificacaoFuncional === "ADMINISTRATIVA" ? "(administrativa)" : "(atividade-fim)"}</td><td>R$ ${Number(dd.total).toFixed(2)}</td></tr>`);
    html += `<tr><td><strong>Total de Despesas</strong></td><td><strong>R$ ${Number(d.totalDespesas).toFixed(2)}</strong></td></tr>
      <tr><td>— das quais atividades-fim</td><td>R$ ${Number(d.classificacaoFuncional.atividadesFim).toFixed(2)}</td></tr>
      <tr><td>— das quais administrativas</td><td>R$ ${Number(d.classificacaoFuncional.administrativas).toFixed(2)}</td></tr>
      <tr><td><strong>${d.resultadoDoPeriodo >= 0 ? "Superávit" : "Déficit"} do Período</strong></td><td><strong>R$ ${Number(d.resultadoDoPeriodo).toFixed(2)}</strong></td></tr>
      </tbody></table>`;
    container.innerHTML = html;
    return;
  }

  if (tipo === "mutacoes") {
    container.innerHTML = `<h4>Mutações do Patrimônio Líquido (${escaparHtmlEbd(d.dataInicio.slice(0, 10))} a ${escaparHtmlEbd(d.dataFim.slice(0, 10))})</h4>
      <table class="tabela-frequencia"><tbody>
        <tr><td>Patrimônio Líquido Inicial</td><td>R$ ${Number(d.patrimonioLiquidoInicial).toFixed(2)}</td></tr>
        <tr><td>(+/-) Resultado do Período</td><td>R$ ${Number(d.resultadoDoPeriodo).toFixed(2)}</td></tr>
        <tr><td><strong>Patrimônio Líquido Final</strong></td><td><strong>R$ ${Number(d.patrimonioLiquidoFinal).toFixed(2)}</strong></td></tr>
      </tbody></table>`;
    return;
  }

  if (tipo === "fluxocaixa") {
    container.innerHTML = `<h4>Fluxo de Caixa (${escaparHtmlEbd(d.dataInicio.slice(0, 10))} a ${escaparHtmlEbd(d.dataFim.slice(0, 10))})</h4>
      <table class="tabela-frequencia"><tbody>
        <tr><td>Saldo Inicial de Caixa</td><td>R$ ${Number(d.saldoInicial).toFixed(2)}</td></tr>
        <tr><td>Entradas Operacionais</td><td>R$ ${Number(d.entradasOperacionais).toFixed(2)}</td></tr>
        <tr><td>Saídas Operacionais</td><td>R$ ${Number(d.saidasOperacionais).toFixed(2)}</td></tr>
        <tr><td>Variação Líquida</td><td>R$ ${Number(d.variacaoLiquida).toFixed(2)}</td></tr>
        <tr><td><strong>Saldo Final de Caixa</strong></td><td><strong>R$ ${Number(d.saldoFinal).toFixed(2)}</strong></td></tr>
      </tbody></table>`;
  }
}

async function carregarNotasExplicativasAcao() {
  const ano = document.getElementById("notasExplicativasAno").value;
  if (!ano) { mostrarToast("Informe o ano.", "erro"); return; }
  const res = await fetchProtegido(`${API_BASE}/notas-explicativas/${ano}`);
  const data = await jsonDaTela(res, document.getElementById("resultadoNotasExplicativas"), "objeto");
  if (data === null) return;
  document.getElementById("notasExplicativasTexto").value = data.texto || "";
}

async function salvarNotasExplicativasAcao() {
  const ano = document.getElementById("notasExplicativasAno").value;
  const texto = document.getElementById("notasExplicativasTexto").value;
  const resultado = document.getElementById("resultadoNotasExplicativas");
  if (!ano) { resultado.textContent = "Informe o ano."; return; }
  const res = await fetchProtegido(`${API_BASE}/notas-explicativas/${ano}`, {
    method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ texto })
  });
  const data = await res.json();
  avisarResultado(data);
  resultado.textContent = data.mensagem;
}

// ---- SITUAÇÃO DO TESOURO EM TEMPO REAL (v4.10, fundação) — quanto cada
// Centro de Custo tem AGORA, sem esperar o fechamento do mês. Tudo
// calculado na leitura a cada chamada.
async function carregarSituacaoTesouroAcao() {
  const container = document.getElementById("resultadoSituacaoTesouro");
  container.innerHTML = "<p class='subtitle'>Carregando…</p>";
  const res = await fetchProtegido(`${API_BASE}/situacao-tesouro`);
  const d = await jsonDaTela(res, container, "objeto");
  if (d === null) return;
  if (d.sucesso === false) { container.innerHTML = `<p class="subtitle">${escaparHtmlEbd(d.mensagem)}</p>`; return; }

  const card = (titulo, valor, cor) => `<div style="flex:1; min-width:180px; border:1px solid #e0e0e0; border-radius:8px; padding:14px; background:${cor || "#fff"};">
    <div class="subtitle" style="margin:0 0 6px;">${titulo}</div>
    <div style="font-size:1.4rem; font-weight:700;">R$ ${Number(valor).toFixed(2)}</div>
  </div>`;

  let html = `<div style="display:flex; flex-wrap:wrap; gap:12px;">
    ${card("Tesouro Geral (gastável)", d.tesouroGeral, "#eef7ee")}
    ${card("Convenção", d.convencao)}
    ${card("Prebenda Pastoral", d.prebendaPastoral)}
    ${card("Fundo PDQ", d.pdq)}
    ${card("Local consolidado (todas congregações)", d.totalLocalConsolidado)}
    ${card("Pendente no malote (não rateado ainda)", d.malotePendente.totalBase, "#fff7e6")}
  </div>`;
  if (d.malotePendente.totalItens > 0) {
    html += `<p class="subtitle" style="margin-top:8px;">⚠️ ${escaparHtmlEbd(d.malotePendente.totalItens)} repasse(s) aguardando o próximo fechamento do Rateio Geral — esse valor ainda não está em nenhum Centro de Custo gastável.</p>`;
  }

  html += `<h4 style="margin:18px 0 8px; color: var(--cor-primaria);">Saldo Local por congregação</h4>
    <table class="tabela-frequencia"><thead><tr><th>Congregação</th><th>Saldo Local</th></tr></thead><tbody>`;
  d.porCongregacao.forEach(c => {
    html += `<tr><td>${escaparHtmlEbd(c.congregacaoNome)}</td><td>R$ ${Number(c.saldoLocal).toFixed(2)}</td></tr>`;
  });
  html += "</tbody></table>";

  // v5.4 (correção) — dinheiro de departamento é discricionário dele
  // (Art. 49), não se mistura nos cards acima, mas fica visível aqui pro
  // Conselho Fiscal auditar sem abrir uma tela por departamento.
  if (Array.isArray(d.porDepartamento) && d.porDepartamento.length > 0) {
    html += `<h4 style="margin:18px 0 8px; color: var(--cor-primaria);">Departamentos e Secretarias (fundo próprio, Art. 49)</h4>
      <table class="tabela-frequencia"><thead><tr><th>Departamento</th><th>Saldo Local consolidado</th><th>Saldo Geral (último balancete fechado)</th></tr></thead><tbody>`;
    d.porDepartamento.forEach(dep => {
      html += `<tr><td>${escaparHtmlEbd(dep.nome)}</td><td>R$ ${Number(dep.saldoLocalConsolidado).toFixed(2)}</td>
        <td>${dep.saldoGeralUltimoBalancete === null ? "nunca fechado" : `R$ ${Number(dep.saldoGeralUltimoBalancete).toFixed(2)}`}</td></tr>`;
    });
    html += "</tbody></table>";
  }

  container.innerHTML = html;
}

// ---- RATEIO GERAL: MALOTE DOS 60% (v4.10, fundação) — controle interno
// dos repasses liberados de cada congregação (semanal, mensal, atrasado)
// até a Tesouraria Geral fechar o Rateio Geral do mês, dividindo entre
// Convenção/Prebenda Pastoral/Fundo PDQ/Tesouro Geral. Um repasse só
// entra em UM Rateio Geral — nunca dois.
async function carregarMalotePendenteAcao() {
  const container = document.getElementById("resultadoMalotePendente");
  const res = await fetchProtegido(`${API_BASE}/rateio-geral/pendentes`);
  const d = await jsonDaTela(res, container, "objeto");
  if (d === null) return;
  if (!d.totalItens || d.totalItens === 0) {
    container.innerHTML = "<p class='subtitle'>Nada pendente no malote — todos os repasses liberados já foram rateados.</p>";
    return;
  }
  let html = `<p class="subtitle"><strong>${escaparHtmlEbd(d.totalItens)} repasse(s)</strong> pendente(s), total <strong>R$ ${Number(d.totalBase).toFixed(2)}</strong>. Previsão se fechar agora:</p>
    <table class="tabela-frequencia"><thead><tr><th>Destino</th><th>%</th><th>Valor previsto</th></tr></thead><tbody>`;
  d.previsaoDestinos.forEach(p => html += `<tr><td>${escaparHtmlEbd(p.nome)}</td><td>${escaparHtmlEbd(p.percentual)}%</td><td>R$ ${Number(p.valor).toFixed(2)}</td></tr>`);
  html += `<tr><td><strong>Tesouro Geral (resto)</strong></td><td></td><td><strong>R$ ${Number(d.previsaoTesouroGeral).toFixed(2)}</strong></td></tr></tbody></table>`;

  html += `<h4 style="margin:14px 0 6px; color: var(--cor-primaria);">Repasses no malote</h4>
    <table class="tabela-frequencia"><thead><tr><th>Congregação</th><th>Mês</th><th>Valor</th><th>Atraso</th></tr></thead><tbody>`;
  d.itens.forEach(i => {
    html += `<tr><td>${escaparHtmlEbd(i.congregacaoNome)}</td><td>${escaparHtmlEbd(i.mesReferencia)}</td><td>R$ ${Number(i.valor).toFixed(2)}</td>
      <td>${i.mesesAtraso > 0 ? `<span class="badge-status badge-pendente">${escaparHtmlEbd(i.mesesAtraso)} mês(es)</span>` : "—"}</td></tr>`;
  });
  html += "</tbody></table>";
  container.innerHTML = html;
}

async function fecharRateioGeralAcao() {
  const resultado = document.getElementById("resultadoFecharRateioGeral");
  if (!(await confirmarAcao("Fechar o Rateio Geral com tudo que está pendente no malote agora? Essa ação não pode ser desfeita.", "Fechar"))) return;
  const res = await fetchProtegido(`${API_BASE}/rateio-geral`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({})
  });
  const data = await res.json();
  avisarResultado(data);
  resultado.textContent = data.mensagem;
  if (data.sucesso) { carregarMalotePendenteAcao(); carregarRateiosGeraisAcao(); }
}

async function carregarRateiosGeraisAcao() {
  const container = document.getElementById("resultadoRateiosGerais");
  const res = await fetchProtegido(`${API_BASE}/rateio-geral`);
  const rateios = await jsonDaTela(res, container, "lista");
  if (rateios === null) return;
  if (!Array.isArray(rateios) || rateios.length === 0) {
    container.innerHTML = "<p class='subtitle'>Nenhum Rateio Geral fechado ainda.</p>";
    return;
  }
  let html = `<table class="tabela-frequencia"><thead><tr><th>Mês</th><th>Repasses</th><th>Total Base</th><th>Tesouro Geral</th><th></th></tr></thead><tbody>`;
  rateios.forEach(r => {
    html += `<tr><td>${escaparHtmlEbd(r.mesReferencia)}</td><td>${escaparHtmlEbd(r.totalItens)}</td><td>R$ ${Number(r.totalBase).toFixed(2)}</td><td>R$ ${Number(r.valorTesouroGeral).toFixed(2)}</td>
      <td class="acoes-inline"><button class="btn-link" data-on-click="verDetalheRateioGeralAcao" data-args-click="${argsAttr(r.rateioGeralId)}">Ver detalhe</button></td></tr>`;
  });
  html += "</tbody></table>";
  container.innerHTML = html;
}

async function verDetalheRateioGeralAcao(rateioGeralId) {
  const container = document.getElementById("detalheRateioGeral");
  const res = await fetchProtegido(`${API_BASE}/rateio-geral/${rateioGeralId}`);
  const r = await jsonDaTela(res, container, "objeto");
  if (r === null) return;
  if (r.sucesso === false) { container.innerHTML = `<p class="subtitle">${escaparHtmlEbd(r.mensagem)}</p>`; return; }

  let html = `<hr /><h4>Rateio Geral de ${escaparHtmlEbd(r.mesReferencia)}</h4>
    <p class="subtitle">Total base: R$ ${Number(r.totalBase).toFixed(2)} — ${escaparHtmlEbd(r.totalItens)} repasse(s)</p>
    <table class="tabela-frequencia"><thead><tr><th>Destino</th><th>%</th><th>Valor</th></tr></thead><tbody>`;
  r.valores.forEach(v => html += `<tr><td>${escaparHtmlEbd(v.destinoNome)}</td><td>${escaparHtmlEbd(v.percentual)}%</td><td>R$ ${Number(v.valor).toFixed(2)}</td></tr>`);
  html += `<tr><td><strong>Tesouro Geral (resto)</strong></td><td></td><td><strong>R$ ${Number(r.valorTesouroGeral).toFixed(2)}</strong></td></tr></tbody></table>`;

  html += `<h4 style="margin:14px 0 6px; color: var(--cor-primaria);">Repasses incluídos</h4>
    <table class="tabela-frequencia"><thead><tr><th>Congregação</th><th>Mês</th><th>Valor</th></tr></thead><tbody>`;
  r.itens.forEach(i => html += `<tr><td>${escaparHtmlEbd(i.congregacaoNome)}</td><td>${escaparHtmlEbd(i.mesReferenciaCongregacao)}</td><td>R$ ${Number(i.valor).toFixed(2)}</td></tr>`);
  html += "</tbody></table>";
  container.innerHTML = html;
}

// ---- PREBENDA E SUSTENTO PASTORAL (v4.10, fechamento) ----
async function carregarAtosDesignacaoAcao() {
  const container = document.getElementById("resultadoAtosDesignacao");
  const res = await fetchProtegido(`${API_BASE}/atos-designacao`);
  const atos = await jsonDaTela(res, container, "lista");
  if (atos === null) return;
  const select = document.getElementById("prebendaAtoId");
  select.innerHTML = `<option value="">— Sem ato vinculado —</option>`;
  if (!Array.isArray(atos) || atos.length === 0) {
    container.innerHTML = "<p class='subtitle'>Nenhum ato de designação registrado.</p>";
    return;
  }
  atos.forEach(a => select.innerHTML += `<option value="${a.atoDesignacaoId}">${escaparHtmlEbd(a.numeroAto)} — ${escaparHtmlEbd(a.nomeMinistro)} (R$ ${Number(a.valorMensal).toFixed(2)})</option>`);
  let html = `<table class="tabela-frequencia"><thead><tr><th>Nº</th><th>Ministro</th><th>Órgão</th><th>Data</th><th>Valor</th></tr></thead><tbody>`;
  atos.forEach(a => html += `<tr><td>${escaparHtmlEbd(a.numeroAto)}</td><td>${escaparHtmlEbd(a.nomeMinistro)}</td><td>${escaparHtmlEbd(a.orgaoColegiado)}</td><td>${escaparHtmlEbd(a.dataDeliberacao.slice(0, 10))}</td><td>R$ ${Number(a.valorMensal).toFixed(2)}</td></tr>`);
  html += "</tbody></table>";
  container.innerHTML = html;
}

async function salvarAtoDesignacaoAcao() {
  const membroId = document.getElementById("prebendaAtoMembroId").value;
  const numeroAto = document.getElementById("prebendaAtoNumero").value.trim();
  const orgaoColegiado = document.getElementById("prebendaAtoOrgao").value.trim();
  const dataDeliberacao = document.getElementById("prebendaAtoData").value;
  const valorMensal = document.getElementById("prebendaAtoValor").value;
  const arquivo = document.getElementById("prebendaAtoAta").files[0];
  const resultado = document.getElementById("resultadoAtoDesignacao");
  if (!membroId || !numeroAto || !orgaoColegiado || !dataDeliberacao || !valorMensal || !arquivo) {
    resultado.textContent = "Preencha todos os campos e anexe a ata.";
    return;
  }
  const body = { membroId: Number(membroId), numeroAto, orgaoColegiado, dataDeliberacao, valorMensal: Number(valorMensal), ataBase64: await arquivoParaBase64(arquivo), mimeType: arquivo.type };
  const res = await fetchProtegido(`${API_BASE}/atos-designacao`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await res.json();
  avisarResultado(data);
  resultado.textContent = data.mensagem;
  if (data.sucesso) carregarAtosDesignacaoAcao();
}

async function carregarOpcoesFornecedoresPrebenda() {
  const select = document.getElementById("prebendaFornecedorId");
  const res = await fetchProtegido(`${API_BASE}/fornecedores`);
  const fornecedores = await jsonDaTela(res, select, "lista");
  if (fornecedores === null) return;
  select.innerHTML = `<option value="">— Selecione (PF) —</option>` +
    (Array.isArray(fornecedores) ? fornecedores.filter(f => f.tipo === "PF").map(f => `<option value="${f.fornecedorId}">${escaparHtmlEbd(f.nome)}</option>`).join("") : "");
}

async function carregarPrebendadosAcao() {
  const container = document.getElementById("resultadoPrebendados");
  const res = await fetchProtegido(`${API_BASE}/prebendados`);
  const lista = await jsonDaTela(res, container, "lista");
  if (lista === null) return;
  if (!Array.isArray(lista) || lista.length === 0) {
    container.innerHTML = "<p class='subtitle'>Nenhum prebendado cadastrado.</p>";
    return;
  }
  let html = `<table class="tabela-frequencia"><thead><tr><th>Ministro</th><th>CPF</th><th>Valor</th><th>Início</th><th>Status</th></tr></thead><tbody>`;
  lista.forEach(p => html += `<tr><td>${escaparHtmlEbd(p.nome)}</td><td>${escaparHtmlEbd(p.cpf)}</td><td>R$ ${Number(p.valorMensalReferencia).toFixed(2)}</td><td>${escaparHtmlEbd(p.dataInicio.slice(0, 10))}</td><td>${escaparHtmlEbd(p.status)}</td></tr>`);
  html += "</tbody></table>";
  container.innerHTML = html;
}

async function carregarOpcoesPrebendadosSelecao() {
  const res = await fetchProtegido(`${API_BASE}/prebendados`);
  const lista = await res.json();
  const risco = document.getElementById("prebendaRiscoPrebendado");
  const aux = document.getElementById("prebendaAuxPrebendado");
  const opcoes = `<option value="">— Selecione —</option>` + (Array.isArray(lista) ? lista.map(p => `<option value="${p.prebendadoId}">${escaparHtmlEbd(p.nome)}</option>`).join("") : "");
  risco.innerHTML = opcoes;
  aux.innerHTML = opcoes;
}

async function salvarPrebendadoAcao() {
  const membroId = document.getElementById("prebendaMembroId").value;
  const fornecedorId = document.getElementById("prebendaFornecedorId").value;
  const cpf = document.getElementById("prebendaCpf").value.trim();
  const valorMensalReferencia = document.getElementById("prebendaValor").value;
  const dataInicio = document.getElementById("prebendaDataInicio").value;
  const atoDesignacaoId = document.getElementById("prebendaAtoId").value;
  const resultado = document.getElementById("resultadoPrebendado");
  if (!membroId || !fornecedorId || !cpf || !valorMensalReferencia || !dataInicio) {
    resultado.textContent = "Preencha todos os campos.";
    return;
  }
  const body = { membroId: Number(membroId), fornecedorId: Number(fornecedorId), cpf, valorMensalReferencia: Number(valorMensalReferencia), dataInicio, atoDesignacaoId: atoDesignacaoId ? Number(atoDesignacaoId) : undefined };
  const res = await fetchProtegido(`${API_BASE}/prebendados`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await res.json();
  avisarResultado(data);
  resultado.textContent = data.mensagem;
  if (data.sucesso) { carregarPrebendadosAcao(); carregarOpcoesPrebendadosSelecao(); }
}

async function carregarFolhaPrebendaAcao() {
  const container = document.getElementById("resultadoPrebendas");
  const res = await fetchProtegido(`${API_BASE}/prebendas`);
  const lista = await jsonDaTela(res, container, "lista");
  if (lista === null) return;
  if (!Array.isArray(lista) || lista.length === 0) {
    container.innerHTML = "<p class='subtitle'>Nenhuma folha gerada ainda.</p>";
    return;
  }
  let html = `<table class="tabela-frequencia"><thead><tr><th>Mês</th><th>Ministro</th><th>Bruto</th><th>IRRF</th><th>Líquido</th><th>Status</th></tr></thead><tbody>`;
  lista.forEach(g => html += `<tr><td>${escaparHtmlEbd(g.mesReferencia)}</td><td>${escaparHtmlEbd(g.nome)}</td><td>R$ ${Number(g.valorBruto).toFixed(2)}</td><td>R$ ${Number(g.irrfRetido).toFixed(2)}</td><td>R$ ${Number(g.valorLiquido).toFixed(2)}</td><td>${escaparHtmlEbd(g.status)}${g.alertaRisco ? " ⚠️" : ""}</td></tr>`);
  html += "</tbody></table>";
  container.innerHTML = html;
}

async function gerarFolhaPrebendaAcao() {
  const mesReferencia = document.getElementById("prebendaMes").value;
  const resultado = document.getElementById("resultadoFolhaPrebenda");
  const body = mesReferencia ? { mesReferencia } : {};
  const res = await fetchProtegido(`${API_BASE}/prebendas`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await res.json();
  avisarResultado(data);
  resultado.textContent = data.mensagem;
  carregarFolhaPrebendaAcao();
}

async function carregarRiscosVinculoAcao() {
  const container = document.getElementById("resultadoRiscosVinculo");
  const res = await fetchProtegido(`${API_BASE}/prebendas/alertas-risco`);
  const lista = await jsonDaTela(res, container, "lista");
  if (lista === null) return;
  if (!Array.isArray(lista) || lista.length === 0) {
    container.innerHTML = "<p class='subtitle'>Nenhum alerta de risco ativo. ✅</p>";
    return;
  }
  let html = `<table class="tabela-frequencia"><thead><tr><th>Ministro</th><th>Tipo</th><th>Descrição</th><th></th></tr></thead><tbody>`;
  lista.forEach(r => html += `<tr><td>${escaparHtmlEbd(r.nome)}</td><td>${escaparHtmlEbd(r.tipoRisco)}</td><td>${escaparHtmlEbd(r.descricao)}</td><td><button class="btn-link" data-on-click="resolverRiscoVinculoAcao" data-args-click="${argsAttr(r.riscoVinculoId)}">Resolver</button></td></tr>`);
  html += "</tbody></table>";
  container.innerHTML = html;
}

async function registrarRiscoVinculoAcao() {
  const prebendadoId = document.getElementById("prebendaRiscoPrebendado").value;
  const tipoRisco = document.getElementById("prebendaRiscoTipo").value;
  const descricao = document.getElementById("prebendaRiscoDescricao").value.trim();
  if (!prebendadoId || !descricao) { mostrarToast("Informe prebendado e descrição.", "erro"); return; }
  const res = await fetchProtegido(`${API_BASE}/prebendas/riscos`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prebendadoId: Number(prebendadoId), tipoRisco, descricao }) });
  const data = await res.json();
  avisarResultado(data);
  carregarRiscosVinculoAcao();
}

async function resolverRiscoVinculoAcao(riscoId) {
  const res = await fetchProtegido(`${API_BASE}/prebendas/riscos`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ riscoId, acao: "RESOLVER" }) });
  const data = await res.json();
  avisarResultado(data);
  carregarRiscosVinculoAcao();
}

async function carregarAuxiliosCustoAcao() {
  const container = document.getElementById("resultadoAuxiliosCusto");
  const res = await fetchProtegido(`${API_BASE}/auxilios-custo`);
  const lista = await jsonDaTela(res, container, "lista");
  if (lista === null) return;
  if (!Array.isArray(lista) || lista.length === 0) {
    container.innerHTML = "<p class='subtitle'>Nenhum auxílio/ajuda de custo cadastrado.</p>";
    return;
  }
  let html = `<table class="tabela-frequencia"><thead><tr><th>Ministro</th><th>Tipo</th><th>Natureza</th><th>Valor</th><th>Status</th></tr></thead><tbody>`;
  lista.forEach(a => html += `<tr><td>${escaparHtmlEbd(a.nome)}</td><td>${escaparHtmlEbd(a.tipo)}</td><td>${escaparHtmlEbd(a.naturezaFiscal)}</td><td>R$ ${Number(a.valorMensal).toFixed(2)}</td><td>${escaparHtmlEbd(a.status)}</td></tr>`);
  html += "</tbody></table>";
  container.innerHTML = html;
}

async function salvarAuxilioCustoAcao() {
  const prebendadoId = document.getElementById("prebendaAuxPrebendado").value;
  const tipo = document.getElementById("prebendaAuxTipo").value;
  const naturezaFiscal = document.getElementById("prebendaAuxNatureza").value;
  const valorMensal = document.getElementById("prebendaAuxValor").value;
  const resultado = document.getElementById("resultadoAuxilioCusto");
  if (!prebendadoId || !valorMensal) { resultado.textContent = "Informe prebendado e valor."; return; }
  const res = await fetchProtegido(`${API_BASE}/auxilios-custo`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prebendadoId: Number(prebendadoId), tipo, naturezaFiscal, valorMensal: Number(valorMensal) }) });
  const data = await res.json();
  avisarResultado(data);
  resultado.textContent = data.mensagem;
  if (data.sucesso) carregarAuxiliosCustoAcao();
}

// ---- PATRIMÔNIO (v4.11) ----
async function carregarOpcoesBens() {
  const res = await fetchProtegido(`${API_BASE}/bens-patrimoniais`);
  const lista = await res.json();
  const opcoes = `<option value="">— Selecione —</option>` + (Array.isArray(lista) ? lista.map(b => `<option value="${b.bemId}">${escaparHtmlEbd(b.descricao)}</option>`).join("") : "");
  ["alienacaoBemId", "docBemId", "casaBemId"].forEach(id => { const el = document.getElementById(id); if (el) el.innerHTML = opcoes; });
}

async function carregarBensPatrimoniaisAcao() {
  const container = document.getElementById("resultadoBensPatrimoniais");
  const res = await fetchProtegido(`${API_BASE}/bens-patrimoniais`);
  const lista = await jsonDaTela(res, container, "lista");
  if (lista === null) return;
  if (!Array.isArray(lista) || lista.length === 0) {
    container.innerHTML = "<p class='subtitle'>Nenhum bem cadastrado.</p>";
    return;
  }
  let html = `<table class="tabela-frequencia"><thead><tr><th>Bem</th><th>Tipo</th><th>Valor original</th><th>Aquisição</th><th>Líquido</th><th>Status</th></tr></thead><tbody>`;
  lista.forEach(b => html += `<tr><td>${escaparHtmlEbd(b.descricao)}</td><td>${escaparHtmlEbd(b.tipo)}</td><td>R$ ${Number(b.valorAquisicao).toFixed(2)}</td><td>${escaparHtmlEbd(b.dataAquisicao.slice(0, 10))}</td><td>R$ ${Number(b.valorContabilLiquido).toFixed(2)}</td><td>${escaparHtmlEbd(b.status)}</td></tr>`);
  html += "</tbody></table>";
  container.innerHTML = html;
  carregarOpcoesBens();
}

async function salvarBemPatrimonialAcao() {
  const tipo = document.getElementById("bemTipo").value;
  const descricao = document.getElementById("bemDescricao").value.trim();
  const valorAquisicao = document.getElementById("bemValorAquisicao").value;
  const dataAquisicao = document.getElementById("bemDataAquisicao").value;
  const vidaUtilMeses = document.getElementById("bemVidaUtil").value;
  const valorResidual = document.getElementById("bemValorResidual").value;
  const ehTemploSede = document.getElementById("bemEhTemploSede").checked;
  const resultado = document.getElementById("resultadoBem");
  if (!tipo || !descricao || !valorAquisicao || !dataAquisicao) { resultado.textContent = "Preencha tipo, descrição, valor e data."; return; }
  const body = { tipo, descricao, valorAquisicao: Number(valorAquisicao), dataAquisicao, vidaUtilMeses: vidaUtilMeses ? Number(vidaUtilMeses) : undefined, valorResidual: valorResidual ? Number(valorResidual) : undefined, ehTemploSede };
  const res = await fetchProtegido(`${API_BASE}/bens-patrimoniais`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await res.json();
  avisarResultado(data);
  resultado.textContent = data.mensagem;
  if (data.sucesso) carregarBensPatrimoniaisAcao();
}

async function carregarAlienacoesBensAcao() {
  const container = document.getElementById("resultadoAlienacoes");
  const res = await fetchProtegido(`${API_BASE}/alienacoes-bens`);
  const lista = await jsonDaTela(res, container, "lista");
  if (lista === null) return;
  if (!Array.isArray(lista) || lista.length === 0) {
    container.innerHTML = "<p class='subtitle'>Nenhuma alienação registrada.</p>";
    return;
  }
  let html = `<table class="tabela-frequencia"><thead><tr><th>Bem</th><th>Valor proposto</th><th>Alçada</th><th>Status</th><th></th></tr></thead><tbody>`;
  lista.forEach(a => html += `<tr>
    <td>${escaparHtmlEbd(a.bemDescricao)}</td><td>R$ ${Number(a.ValorProposto).toFixed(2)}</td><td>${escaparHtmlEbd(a.AprovacaoNecessaria)}</td><td>${escaparHtmlEbd(a.Status)}</td>
    <td>${a.Status === "PROPOSTA" ? `<button class="btn-link" data-on-click="abrirParecerViabilidadeAcao" data-args-click="${argsAttr(a.AlienacaoId)}">📋 Parecer de Viabilidade (Art. 31)</button>` : ""}</td>
  </tr>`);
  html += "</tbody></table>";
  container.innerHTML = html;
}

// vB.14 — Parecer de Viabilidade (Art. 31): pré-condição de alienação de
// alto valor. Só quem tem assento ativo no Conselho Consultivo Técnico
// consegue emitir de verdade (o backend recusa quem não tem) — o formulário
// fica visível pra quem opera Patrimônio pedir pro conselheiro preencher.
window._alienacaoParecerAtual = null;

function abrirParecerViabilidadeAcao(alienacaoId) {
  window._alienacaoParecerAtual = alienacaoId;
  const resultado = document.getElementById("resultadoAlienacao");
  resultado.innerHTML = `
    <div class="barra-lista">
      <select id="parecerViabilidadeDecisao"><option value="FAVORAVEL">Favorável</option><option value="DESFAVORAVEL">Desfavorável</option></select>
      <input type="text" id="parecerViabilidadeJustificativa" placeholder="Justificativa" style="min-width:260px;" />
      <button class="btn-confirmar" style="width:auto;margin:0;" data-on-click="emitirParecerViabilidadeAcao">Emitir Parecer</button>
    </div>`;
}

async function emitirParecerViabilidadeAcao() {
  const alienacaoId = window._alienacaoParecerAtual;
  if (!alienacaoId) return;
  const decisao = document.getElementById("parecerViabilidadeDecisao").value;
  const justificativa = document.getElementById("parecerViabilidadeJustificativa").value.trim() || null;
  const res = await fetchProtegido(`${API_BASE}/alienacoes-bens/${alienacaoId}`, {
    method: "PUT", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ acao: "PARECER_VIABILIDADE", decisao, justificativa })
  });
  const data = await res.json();
  avisarResultado(data);
  if (data.sucesso) {
    document.getElementById("resultadoAlienacao").textContent = "";
    carregarAlienacoesBensAcao();
  }
}

async function proporAlienacaoAcao() {
  const bemId = document.getElementById("alienacaoBemId").value;
  const valorProposto = document.getElementById("alienacaoValorProposto").value;
  const resultado = document.getElementById("resultadoAlienacao");
  if (!bemId || !valorProposto) { resultado.textContent = "Informe o bem e o valor proposto."; return; }
  const res = await fetchProtegido(`${API_BASE}/alienacoes-bens`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ bemId: Number(bemId), valorProposto: Number(valorProposto) }) });
  const data = await res.json();
  avisarResultado(data);
  resultado.textContent = data.mensagem;
  if (data.sucesso) carregarAlienacoesBensAcao();
}

async function carregarDocumentosBensAcao() {
  const container = document.getElementById("resultadoDocumentosBens");
  const res = await fetchProtegido(`${API_BASE}/bens-documentos`);
  const lista = await jsonDaTela(res, container, "lista");
  if (lista === null) return;
  if (!Array.isArray(lista) || lista.length === 0) {
    container.innerHTML = "<p class='subtitle'>Nenhum documento patrimonial registrado.</p>";
    return;
  }
  let html = `<table class="tabela-frequencia"><thead><tr><th>Tipo</th><th>Descrição</th><th>Responsável</th></tr></thead><tbody>`;
  lista.forEach(d => html += `<tr><td>${escaparHtmlEbd(d.tipoDocumento)}</td><td>${escaparHtmlEbd(d.descricao)}</td><td>${escaparHtmlEbd(d.responsavelCargo)}</td></tr>`);
  html += "</tbody></table>";
  container.innerHTML = html;
}

async function salvarDocumentoBemAcao() {
  const bemId = document.getElementById("docBemId").value;
  const tipoDocumento = document.getElementById("docTipoDocumento").value;
  const descricao = document.getElementById("docDescricao").value.trim();
  const responsavelCargo = document.getElementById("docResponsavelCargo").value;
  const arquivo = document.getElementById("docArquivo").files[0];
  const resultado = document.getElementById("resultadoDocumentoBem");
  if (!tipoDocumento || !descricao || !responsavelCargo || !arquivo) { resultado.textContent = "Preencha todos os campos e anexe o documento."; return; }
  const body = { bemId: bemId ? Number(bemId) : undefined, tipoDocumento, descricao, responsavelCargo, documentoBase64: await arquivoParaBase64(arquivo), mimeType: arquivo.type };
  const res = await fetchProtegido(`${API_BASE}/bens-documentos`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await res.json();
  avisarResultado(data);
  resultado.textContent = data.mensagem;
  if (data.sucesso) carregarDocumentosBensAcao();
}

async function carregarInventariosAcao() {
  const container = document.getElementById("resultadoInventarios");
  const res = await fetchProtegido(`${API_BASE}/inventarios`);
  const lista = await jsonDaTela(res, container, "lista");
  if (lista === null) return;
  if (!Array.isArray(lista) || lista.length === 0) {
    container.innerHTML = "<p class='subtitle'>Nenhum inventário aberto.</p>";
    return;
  }
  let html = `<table class="tabela-frequencia"><thead><tr><th>Ano</th><th>Escopo</th><th>Itens</th><th>Status</th></tr></thead><tbody>`;
  lista.forEach(i => html += `<tr><td>${escaparHtmlEbd(i.anoReferencia)}</td><td>${escaparHtmlEbd(i.congregacaoNome) || "Sede"}</td><td>${escaparHtmlEbd(i.totalItens)}</td><td>${escaparHtmlEbd(i.status)}</td></tr>`);
  html += "</tbody></table>";
  container.innerHTML = html;
}

async function abrirInventarioAcao() {
  const anoReferencia = document.getElementById("invAnoReferencia").value;
  const congregacaoId = document.getElementById("invCongregacao").value;
  const resultado = document.getElementById("resultadoInventario");
  if (!anoReferencia) { resultado.textContent = "Informe o ano."; return; }
  const body = { anoReferencia: Number(anoReferencia), congregacaoId: congregacaoId ? Number(congregacaoId) : undefined };
  const res = await fetchProtegido(`${API_BASE}/inventarios`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await res.json();
  avisarResultado(data);
  resultado.textContent = data.mensagem;
  if (data.sucesso) carregarInventariosAcao();
}

async function carregarOcupacoesCasaPastoralAcao() {
  const container = document.getElementById("resultadoCasaPastoral");
  const res = await fetchProtegido(`${API_BASE}/casa-pastoral`);
  const lista = await jsonDaTela(res, container, "lista");
  if (lista === null) return;
  if (!Array.isArray(lista) || lista.length === 0) {
    container.innerHTML = "<p class='subtitle'>Nenhuma ocupação de Casa Pastoral registrada.</p>";
    return;
  }
  let html = `<table class="tabela-frequencia"><thead><tr><th>Casa</th><th>Dirigente</th><th>Congregação</th><th>Início</th><th>Status</th></tr></thead><tbody>`;
  lista.forEach(o => html += `<tr><td>${escaparHtmlEbd(o.casaDescricao)}</td><td>${escaparHtmlEbd(o.ocupanteNome)}</td><td>${escaparHtmlEbd(o.congregacaoNome)}</td><td>${escaparHtmlEbd(o.dataInicio.slice(0, 10))}</td><td>${escaparHtmlEbd(o.status)}</td></tr>`);
  html += "</tbody></table>";
  container.innerHTML = html;
}

async function salvarOcupacaoCasaPastoralAcao() {
  const bemId = document.getElementById("casaBemId").value;
  const congregacaoId = document.getElementById("casaCongregacao").value;
  const ocupanteMembroId = document.getElementById("casaOcupanteMembroId").value;
  const dataInicio = document.getElementById("casaDataInicio").value;
  const resultado = document.getElementById("resultadoCasaPastoralAcao");
  if (!bemId || !congregacaoId || !ocupanteMembroId || !dataInicio) { resultado.textContent = "Preencha todos os campos."; return; }
  const body = { bemId: Number(bemId), congregacaoId: Number(congregacaoId), ocupanteMembroId: Number(ocupanteMembroId), dataInicio };
  const res = await fetchProtegido(`${API_BASE}/casa-pastoral`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await res.json();
  avisarResultado(data);
  resultado.textContent = data.mensagem;
  if (data.sucesso) carregarOcupacoesCasaPastoralAcao();
}

// ---- FROTA DE VEÍCULOS (v4.23) ----
async function carregarAlertasFrotaAcao() {
  const container = document.getElementById("resultadoAlertasFrota");
  const res = await fetchProtegido(`${API_BASE}/manutencoes-veiculo/alertas`);
  const lista = await jsonDaTela(res, container, "lista");
  if (lista === null) return;
  if (!Array.isArray(lista) || lista.length === 0) {
    container.innerHTML = "<p class='subtitle'>Nenhum alerta no momento. ✅</p>";
    return;
  }
  let html = `<table class="tabela-frequencia"><thead><tr><th>Veículo</th><th>Licenciamento</th><th>Seguro</th><th>Próx. manutenção</th></tr></thead><tbody>`;
  lista.forEach(a => {
    html += `<tr><td>${escaparHtmlEbd(a.bemDescricao)}</td>
      <td>${a.licenciamentoAlerta ? "⚠️ " : ""}${escaparHtmlEbd(a.licenciamentoVencimento) || "não informado"}</td>
      <td>${a.seguroAlerta ? "⚠️ " : ""}${escaparHtmlEbd(a.seguroVencimento) || "sem apólice ativa"}</td>
      <td>${a.manutencaoAlerta ? "⚠️ " : ""}${escaparHtmlEbd(a.proximaManutencaoAgendada) || "-"}</td></tr>`;
  });
  html += "</tbody></table>";
  container.innerHTML = html;
}

async function carregarFrotaAcao() {
  const container = document.getElementById("resultadoFrota");
  const res = await fetchProtegido(`${API_BASE}/frota`);
  const lista = await jsonDaTela(res, container, "lista");
  if (lista === null) return;
  if (!Array.isArray(lista) || lista.length === 0) {
    container.innerHTML = "<p class='subtitle'>Nenhum veículo cadastrado no Patrimônio (Tipo = Veículo).</p>";
    return;
  }
  let html = `<table class="tabela-frequencia"><thead><tr><th>Veículo</th><th>Placa</th><th>Identificação visual</th><th>Presidencial</th><th>Licenciamento</th></tr></thead><tbody>`;
  lista.forEach(v => {
    html += `<tr><td>${escaparHtmlEbd(v.descricao)}</td><td>${escaparHtmlEbd(v.placa) || "-"}</td><td>${v.identificacaoVisualPendente ? "⚠️ pendente" : "✅"}</td>
      <td>${v.ehVeiculoPresidencial ? "✅" : "-"}</td><td>${escaparHtmlEbd(v.licenciamentoVencimento) || "-"} (${escaparHtmlEbd(v.licenciamentoSituacao)})</td></tr>`;
  });
  html += "</tbody></table>";
  container.innerHTML = html;
}

async function salvarFrotaAcao() {
  const bemId = document.getElementById("frotaBemId").value;
  if (!bemId) { alert("Informe o bemId do veículo."); return; }
  const arquivo = document.getElementById("frotaIdentificacaoVisual").files[0];
  const body = {
    placa: document.getElementById("frotaPlaca").value,
    ehVeiculoPresidencial: document.getElementById("frotaPresidencial").value === "1",
    licenciamentoVencimento: document.getElementById("frotaLicenciamento").value || null
  };
  if (arquivo) { body.identificacaoVisualBase64 = await arquivoParaBase64(arquivo); body.mimeType = arquivo.type; }
  const res = await fetchProtegido(`${API_BASE}/frota/${bemId}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const d = await res.json();
  alert(d.mensagem);
  if (d.sucesso) { carregarFrotaAcao(); carregarAlertasFrotaAcao(); }
}

async function carregarTermosConducaoAcao() {
  const container = document.getElementById("resultadoTermosConducao");
  const res = await fetchProtegido(`${API_BASE}/termos-conducao`);
  const lista = await jsonDaTela(res, container, "lista");
  if (lista === null) return;
  if (!Array.isArray(lista) || lista.length === 0) {
    container.innerHTML = "<p class='subtitle'>Nenhum termo emitido.</p>";
    return;
  }
  let html = `<table class="tabela-frequencia"><thead><tr><th>Id</th><th>Veículo</th><th>Condutor</th><th>Missão</th><th>Período</th><th>Status</th></tr></thead><tbody>`;
  lista.forEach(t => html += `<tr><td>${t.TermoId}</td><td>${escaparHtmlEbd(t.bemDescricao)}</td><td>${escaparHtmlEbd(t.condutorNome)}</td><td>${escaparHtmlEbd(t.MissaoDescricao)}</td><td>${escaparHtmlEbd(t.DataInicioMissao)} a ${escaparHtmlEbd(t.DataFimPrevista)}</td><td>${escaparHtmlEbd(t.Status)}</td></tr>`);
  html += "</tbody></table>";
  container.innerHTML = html;
}

async function registrarTermoConducaoAcao() {
  const body = {
    bemId: document.getElementById("termoBemId").value,
    condutorMembroId: document.getElementById("termoCondutorId").value,
    cnhNumero: document.getElementById("termoCnhNumero").value,
    cnhValidade: document.getElementById("termoCnhValidade").value,
    missaoDescricao: document.getElementById("termoMissao").value,
    dataInicioMissao: document.getElementById("termoInicio").value,
    dataFimPrevista: document.getElementById("termoFim").value
  };
  const res = await fetchProtegido(`${API_BASE}/termos-conducao`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const d = await res.json();
  alert(d.mensagem);
  if (d.sucesso) {
    document.getElementById("termoMissao").value = "";
    carregarTermosConducaoAcao();
  }
}

async function carregarRetiradasChaveAcao() {
  const container = document.getElementById("resultadoRetiradasChave");
  const res = await fetchProtegido(`${API_BASE}/retiradas-chave`);
  const lista = await jsonDaTela(res, container, "lista");
  if (lista === null) return;
  if (!Array.isArray(lista) || lista.length === 0) {
    container.innerHTML = "<p class='subtitle'>Nenhuma retirada registrada.</p>";
    return;
  }
  let html = `<table class="tabela-frequencia"><thead><tr><th>Id</th><th>Veículo</th><th>Condutor</th><th>Retirada</th><th>Devolução</th><th>Ação</th></tr></thead><tbody>`;
  lista.forEach(r => {
    html += `<tr><td>${r.RetiradaId}</td><td>${escaparHtmlEbd(r.bemDescricao)}</td><td>${escaparHtmlEbd(r.condutorNome)}</td><td>${new Date(r.DataHoraRetirada).toLocaleString("pt-BR")}</td><td>${r.DataHoraDevolucao ? new Date(r.DataHoraDevolucao).toLocaleString("pt-BR") : "-"}</td>
      <td>${r.DataHoraDevolucao ? "-" : `<button class="btn-confirmar" style="width:auto;padding:4px 8px;" data-on-click="registrarDevolucaoChaveAcao" data-args-click="${argsAttr(r.RetiradaId)}">Devolver</button>`}</td></tr>`;
  });
  html += "</tbody></table>";
  container.innerHTML = html;
}

async function registrarRetiradaChaveAcao() {
  const body = { termoAutorizacaoId: document.getElementById("retiradaTermoId").value };
  const res = await fetchProtegido(`${API_BASE}/retiradas-chave`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const d = await res.json();
  alert(d.mensagem);
  if (d.sucesso) { document.getElementById("retiradaTermoId").value = ""; carregarRetiradasChaveAcao(); }
}

async function registrarDevolucaoChaveAcao(retiradaId) {
  const custo = prompt("Custo de conserto por imprudência do condutor, se houver (R$, opcional):", "");
  const body = { custoConsertoImprudenciaValor: custo ? Number(custo) : null };
  const res = await fetchProtegido(`${API_BASE}/retiradas-chave/${retiradaId}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const d = await res.json();
  alert(d.mensagem);
  if (d.sucesso) carregarRetiradasChaveAcao();
}

async function carregarManutencoesVeiculoAcao() {
  const container = document.getElementById("resultadoManutencoesVeiculo");
  const res = await fetchProtegido(`${API_BASE}/manutencoes-veiculo`);
  const lista = await jsonDaTela(res, container, "lista");
  if (lista === null) return;
  if (!Array.isArray(lista) || lista.length === 0) {
    container.innerHTML = "<p class='subtitle'>Nenhuma manutenção registrada.</p>";
    return;
  }
  let html = `<table class="tabela-frequencia"><thead><tr><th>Veículo</th><th>Tipo</th><th>Agendada</th><th>Realizada</th><th>Ação</th></tr></thead><tbody>`;
  lista.forEach(m => {
    html += `<tr><td>${escaparHtmlEbd(m.bemDescricao)}</td><td>${escaparHtmlEbd(m.TipoManutencao)}</td><td>${escaparHtmlEbd(m.DataAgendada)}</td><td>${escaparHtmlEbd(m.DataRealizada) || "-"}</td>
      <td>${m.DataRealizada ? "-" : `<button class="btn-confirmar" style="width:auto;padding:4px 8px;" data-on-click="concluirManutencaoVeiculoAcao" data-args-click="${argsAttr(m.ManutencaoId)}">Concluir</button>`}</td></tr>`;
  });
  html += "</tbody></table>";
  container.innerHTML = html;
}

async function registrarManutencaoVeiculoAcao() {
  const body = {
    bemId: document.getElementById("manutencaoBemId").value,
    tipoManutencao: document.getElementById("manutencaoTipo").value,
    dataAgendada: document.getElementById("manutencaoData").value,
    descricao: document.getElementById("manutencaoDescricao").value
  };
  const res = await fetchProtegido(`${API_BASE}/manutencoes-veiculo`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const d = await res.json();
  alert(d.mensagem);
  if (d.sucesso) { document.getElementById("manutencaoDescricao").value = ""; carregarManutencoesVeiculoAcao(); }
}

async function concluirManutencaoVeiculoAcao(manutencaoId) {
  const dataRealizada = prompt("Data de realização (AAAA-MM-DD):", new Date().toISOString().slice(0, 10));
  if (!dataRealizada) return;
  const res = await fetchProtegido(`${API_BASE}/manutencoes-veiculo/${manutencaoId}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ dataRealizada }) });
  const d = await res.json();
  alert(d.mensagem);
  if (d.sucesso) { carregarManutencoesVeiculoAcao(); carregarAlertasFrotaAcao(); }
}

// ---- CONCILIAÇÃO BANCÁRIA (v4.13; trilha CAIXA_FISICO sem upload — Trava de Revisão 4-A) ----
async function carregarFontesCaixaAcao() {
  const select = document.getElementById("conciliacaoFonte");
  const res = await fetchProtegido(`${API_BASE}/conciliacao-bancaria/fontes`);
  const lista = await jsonDaTela(res, select, "lista");
  if (lista === null) return;
  select.innerHTML = (Array.isArray(lista) ? lista.map(f => `<option value="${f.fonteId}" data-tipo="${escaparHtmlEbd(f.tipo)}">${escaparHtmlEbd(f.nome)}</option>`).join("") : "");
  if (!select.dataset.listenerTipoAtivo) {
    select.addEventListener("change", atualizarCampoArquivoConciliacaoAcao);
    select.dataset.listenerTipoAtivo = "1";
  }
  atualizarCampoArquivoConciliacaoAcao();
}

// Caixa Físico (cofre) concilia direto contra o Fundo Fixo de Caixa — não tem
// extrato nenhum pra subir, então o campo de arquivo não se aplica a essa trilha.
function atualizarCampoArquivoConciliacaoAcao() {
  const select = document.getElementById("conciliacaoFonte");
  const arquivoInput = document.getElementById("conciliacaoArquivo");
  if (!select || !arquivoInput) return;
  const opcao = select.options[select.selectedIndex];
  const ehCaixaFisico = !!(opcao && opcao.dataset.tipo === "CAIXA_FISICO");
  const grupo = arquivoInput.closest(".input-group") || arquivoInput.parentElement;
  if (grupo) grupo.style.display = ehCaixaFisico ? "none" : "";
}

async function carregarConciliacoesAcao() {
  const container = document.getElementById("resultadoConciliacoes");
  const res = await fetchProtegido(`${API_BASE}/conciliacao-bancaria`);
  const lista = await jsonDaTela(res, container, "lista");
  if (lista === null) return;
  if (!Array.isArray(lista) || lista.length === 0) {
    container.innerHTML = "<p class='subtitle'>Nenhuma conciliação ainda.</p>";
    return;
  }
  let html = `<table class="tabela-frequencia"><thead><tr><th>Fonte</th><th>Mês</th><th>Status</th><th>Batidas</th><th>Divergências</th><th></th></tr></thead><tbody>`;
  lista.forEach(c => html += `<tr><td>${escaparHtmlEbd(c.fonteNome)}</td><td>${escaparHtmlEbd(c.mesReferencia)}</td><td>${escaparHtmlEbd(c.status)}</td><td>R$ ${Number(c.totalBatidas).toFixed(2)}</td><td>${escaparHtmlEbd(c.divergenciasPendentes)}</td><td><button class="btn-link" data-on-click="verDetalheConciliacaoAcao" data-args-click="${argsAttr(c.conciliacaoId)}">Ver</button></td></tr>`);
  html += "</tbody></table>";
  container.innerHTML = html;
}

async function importarExtratoAcao() {
  const select = document.getElementById("conciliacaoFonte");
  const fonteId = select.value;
  const mesReferencia = document.getElementById("conciliacaoMes").value;
  const opcao = select.options[select.selectedIndex];
  const ehCaixaFisico = !!(opcao && opcao.dataset.tipo === "CAIXA_FISICO");
  const arquivo = document.getElementById("conciliacaoArquivo").files[0];
  const resultado = document.getElementById("resultadoConciliacao");
  if (!fonteId || !mesReferencia || (!ehCaixaFisico && !arquivo)) {
    resultado.textContent = ehCaixaFisico ? "Informe fonte e mês." : "Informe fonte, mês e arquivo (OFX/CSV).";
    return;
  }
  const body = ehCaixaFisico
    ? { fonteId: Number(fonteId), mesReferencia }
    : { fonteId: Number(fonteId), mesReferencia, arquivoBase64: await arquivoParaBase64(arquivo), mimeType: arquivo.type || "text/plain" };
  const res = await fetchProtegido(`${API_BASE}/conciliacao-bancaria/extratos`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const d = await res.json();
  avisarResultado(d);
  resultado.textContent = d.mensagem;
  carregarConciliacoesAcao();
}

async function verDetalheConciliacaoAcao(conciliacaoId) {
  const container = document.getElementById("detalheConciliacao");
  const res = await fetchProtegido(`${API_BASE}/conciliacao-bancaria/${conciliacaoId}`);
  const c = await jsonDaTela(res, container, "objeto");
  if (c === null) return;
  if (c.sucesso === false) { container.innerHTML = `<p class="subtitle">${escaparHtmlEbd(c.mensagem)}</p>`; return; }
  const divs = c.divergencias || [];
  let html = `<hr /><h4>Conciliação de ${escaparHtmlEbd(c.mesReferencia)} (${escaparHtmlEbd(c.fonteNome)}) — ${escaparHtmlEbd(c.status)}</h4>`;
  html += `<p class="subtitle">Extrato R$ ${Number(c.totalExtrato).toFixed(2)} · Sistema R$ ${Number(c.totalSistema).toFixed(2)} · Batidas R$ ${Number(c.totalBatidas).toFixed(2)}</p>`;
  if (divs.length === 0) { html += "<p class='subtitle'>Sem divergências pendentes. ✅</p>"; }
  else {
    html += `<table class="tabela-frequencia"><thead><tr><th>Tipo</th><th>Valor</th><th>Referência</th><th></th></tr></thead><tbody>`;
    divs.forEach(d => html += `<tr><td>${d.tipo === "SO_BANCO" ? "Só no banco" : "Só no sistema"}</td><td>R$ ${Number(d.valor).toFixed(2)}</td><td>${escaparHtmlEbd(d.referencia) || "-"}</td>${d.status === "PENDENTE" ? `<td><button class="btn-link" data-on-click="resolverDivergenciaAcao" data-args-click="${argsAttr(d.divergenciaId)}">Resolver</button></td>` : "<td></td>"}</tr>`);
    html += "</tbody></table>";
  }
  container.innerHTML = html;
}

async function resolverDivergenciaAcao(divergenciaId) {
  const res = await fetchProtegido(`${API_BASE}/conciliacao-bancaria/divergencias`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ divergenciaId, acao: "RESOLVER" }) });
  const d = await res.json();
  avisarResultado(d);
  carregarConciliacoesAcao();
}

// ---- INVESTIMENTOS E TESOURARIA AVANÇADA (v4.14) ----
async function salvarAplicacaoAcao() {
  const tipo = document.getElementById("invTipo").value;
  const instituicao = document.getElementById("invInstituicao").value.trim();
  const valorAplicado = document.getElementById("invValor").value;
  const taxaAnual = document.getElementById("invTaxa").value;
  const dataAplicacao = document.getElementById("invDataAplicacao").value;
  const dataVencimento = document.getElementById("invVencimento").value;
  const liquidez = document.getElementById("invLiquidez").value;
  const resultado = document.getElementById("resultadoAplicacao");
  if (!tipo || !instituicao || !valorAplicado || !dataAplicacao) { resultado.textContent = "Preencha tipo, instituição, valor e data."; return; }
  const body = { tipo, instituicao, valorAplicado: Number(valorAplicado), dataAplicacao, liquidez, taxaAnual: taxaAnual ? Number(taxaAnual) : undefined, dataVencimento: dataVencimento || undefined };
  const res = await fetchProtegido(`${API_BASE}/investimentos/aplicacoes`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const d = await res.json();
  avisarResultado(d);
  resultado.textContent = d.mensagem;
  if (d.sucesso) carregarPortfolioAcao();
}

async function carregarPortfolioAcao() {
  const container = document.getElementById("resultadoPortfolio");
  const res = await fetchProtegido(`${API_BASE}/investimentos`);
  const p = await jsonDaTela(res, container, "objeto");
  if (p === null) return;
  if (!Array.isArray(p.itens) || p.itens.length === 0) {
    container.innerHTML = "<p class='subtitle'>Nenhuma aplicação registrada.</p>";
    return;
  }
  let html = `<p class="subtitle">Aplicado R$ ${Number(p.totalAplicado).toFixed(2)} · Resgatado R$ ${Number(p.totalResgatado).toFixed(2)} · Saldo aplicado R$ ${Number(p.saldoAplicado).toFixed(2)} · Valor atual R$ ${Number(p.valorAtualEstimado).toFixed(2)} · Rentabilidade R$ ${Number(p.rentabilidadeAcumulada).toFixed(2)}</p>`;
  html += `<table class="tabela-frequencia"><thead><tr><th>Instituição</th><th>Tipo</th><th>Valor</th><th>Vencimento</th><th>Liquidez</th><th>Atual</th></tr></thead><tbody>`;
  p.itens.forEach(i => html += `<tr><td>${escaparHtmlEbd(i.instituicao)}</td><td>${escaparHtmlEbd(i.tipo)}</td><td>R$ ${Number(i.valorAplicado).toFixed(2)}</td><td>${i.dataVencimento ? escaparHtmlEbd(i.dataVencimento.slice(0, 10)) : "-"}</td><td>${escaparHtmlEbd(i.liquidez)}</td><td>R$ ${Number(i.valorAtualEstimado).toFixed(2)}</td></tr>`);
  html += "</tbody></table>";
  container.innerHTML = html;
}

async function carregarLiquidezAcao() {
  const container = document.getElementById("resultadoLiquidez");
  const res = await fetchProtegido(`${API_BASE}/investimentos/liquidez?meses=6`);
  const d = await jsonDaTela(res, container, "objeto");
  if (d === null) return;
  let html = `<p class="subtitle">Entrada média R$ ${Number(d.mediaEntradas).toFixed(2)} ± R$ ${Number(d.desvioEntradas).toFixed(2)} (faixa: R$ ${Number(d.entradaConservador).toFixed(2)} a R$ ${Number(d.entradaOtimista).toFixed(2)})</p>`;
  html += `<table class="tabela-frequencia"><thead><tr><th>Mês</th><th>Saldo base</th><th>Conservador</th><th>Otimista</th></tr></thead><tbody>`;
  (d.projecao || []).forEach(p => html += `<tr><td>${escaparHtmlEbd(p.mesReferencia)}</td><td>R$ ${Number(p.saldoProjetado).toFixed(2)}</td><td>R$ ${Number(p.saldoConservador).toFixed(2)}</td><td>R$ ${Number(p.saldoOtimista).toFixed(2)}</td></tr>`);
  html += "</tbody></table>";
  container.innerHTML = html;
}

async function carregarCashPoolingAcao() {
  const container = document.getElementById("resultadoCashPooling");
  const res = await fetchProtegido(`${API_BASE}/cash-pooling`);
  const d = await jsonDaTela(res, container, "objeto");
  if (d === null) return;
  const central = d.centralizadora ? `${escaparHtmlEbd(d.centralizadora.nome)}` : "—";
  container.innerHTML = `<table class="tabela-frequencia"><tbody>
    <tr><td>Conta centralizadora</td><td>${central}</td></tr>
    <tr><td>Caixa disponível (Tesouro Geral)</td><td>R$ ${Number(d.caixaDisponivel).toFixed(2)}</td></tr>
    <tr><td>Total aplicado (Fundo de Reserva)</td><td>R$ ${Number(d.totalAplicado).toFixed(2)}</td></tr>
    <tr><td><strong>Posição consolidada (pool)</strong></td><td><strong>R$ ${Number(d.posicaoTotal).toFixed(2)}</strong></td></tr>
    <tr><td>Rentabilidade acumulada</td><td>R$ ${Number(d.rentabilidadeAcumulada).toFixed(2)}</td></tr>
  </tbody></table>`;
}

// ---- REPASSES INSTITUCIONAIS (v4.15) ----
async function carregarRepassesInstitucionaisAcao() {
  const container = document.getElementById("resultadoRepasses");
  const res = await fetchProtegido(`${API_BASE}/repasses-institucionais`);
  const lista = await jsonDaTela(res, container, "lista");
  if (lista === null) return;
  if (!Array.isArray(lista) || lista.length === 0) {
    container.innerHTML = "<p class='subtitle'>Nenhum repasse registrado.</p>";
  } else {
    let html = `<table class="tabela-frequencia"><thead><tr><th>Origem</th><th>Mês</th><th>Arrecadado</th><th>%</th><th>Valor</th><th>Status</th><th></th></tr></thead><tbody>`;
    lista.forEach(r => html += `<tr><td>${escaparHtmlEbd(r.origemNome)}</td><td>${escaparHtmlEbd(r.mesReferencia)}</td><td>R$ ${Number(r.valorArrecadadoLiquido).toFixed(2)}</td><td>${escaparHtmlEbd(r.percentual)}%</td><td>R$ ${Number(r.valorRepasse).toFixed(2)}</td><td>${escaparHtmlEbd(r.status)}${r.atrasado ? " ⚠️" : ""}</td>${r.status === "PENDENTE" ? `<td><button class="btn-link" data-on-click="confirmarRepasseAcao" data-args-click="${argsAttr(r.repasseId)}">Repassar</button></td>` : "<td></td>"}</tr>`);
    html += "</tbody></table>";
    container.innerHTML = html;
  }

  const containerAtraso = document.getElementById("resultadoRepassesAtrasados");
  const resA = await fetchProtegido(`${API_BASE}/repasses-institucionais/alertas`);
  const atrasados = await jsonDaTela(resA, containerAtraso, "lista");
  if (atrasados === null) return;
  if (!Array.isArray(atrasados) || atrasados.length === 0) {
    containerAtraso.innerHTML = "<p class='subtitle'>Nenhum repasse atrasado. ✅</p>";
    return;
  }
  let html = `<table class="tabela-frequencia"><thead><tr><th>Origem</th><th>Mês</th><th>Valor</th></tr></thead><tbody>`;
  atrasados.forEach(r => html += `<tr><td>${escaparHtmlEbd(r.origemNome)}</td><td>${escaparHtmlEbd(r.mesReferencia)}</td><td>R$ ${Number(r.valorRepasse).toFixed(2)}</td></tr>`);
  html += "</tbody></table>";
  containerAtraso.innerHTML = html;
}

async function registrarRepasseInstitucionalAcao() {
  const origemTipo = document.getElementById("repasseOrigemTipo").value;
  const origemId = document.getElementById("repasseOrigemId").value;
  const origemNome = document.getElementById("repasseOrigemNome").value.trim();
  const mesReferencia = document.getElementById("repasseMes").value;
  const valorArrecadadoLiquido = document.getElementById("repasseArrecadado").value;
  const resultado = document.getElementById("resultadoRepasse");
  const ehCongregacao = origemTipo === "CONGREGACAO";
  if (!origemId || !origemNome || !mesReferencia || (!ehCongregacao && !valorArrecadadoLiquido)) { resultado.textContent = "Preencha todos os campos."; return; }
  // CONGREGACAO: arrecadação líquida vem do fechamento da Tesouraria Local
  // (calculada no backend) — nunca envia o valor digitado nesse caso.
  const body = { origemTipo, origemId: Number(origemId), origemNome, mesReferencia };
  if (!ehCongregacao) body.valorArrecadadoLiquido = Number(valorArrecadadoLiquido);
  const res = await fetchProtegido(`${API_BASE}/repasses-institucionais`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const d = await res.json();
  avisarResultado(d);
  resultado.textContent = d.mensagem;
  if (d.sucesso) carregarRepassesInstitucionaisAcao();
}

async function confirmarRepasseAcao(repasseId) {
  const res = await fetchProtegido(`${API_BASE}/repasses-institucionais`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ repasseId, acao: "REPASSAR" }) });
  const d = await res.json();
  avisarResultado(d);
  carregarRepassesInstitucionaisAcao();
}

// ---- SEGUROS INSTITUCIONAIS (v4.16) ----
async function carregarSegurosAcao() {
  const container = document.getElementById("resultadoApolices");
  const res = await fetchProtegido(`${API_BASE}/seguros`);
  const lista = await jsonDaTela(res, container, "lista");
  if (lista === null) return;
  if (!Array.isArray(lista) || lista.length === 0) {
    container.innerHTML = "<p class='subtitle'>Nenhuma apólice registrada.</p>";
  } else {
    let html = `<table class="tabela-frequencia"><thead><tr><th>Seguradora</th><th>Nº</th><th>Tipo</th><th>Vigência</th><th>Coberturas</th></tr></thead><tbody>`;
    lista.forEach(a => html += `<tr><td>${escaparHtmlEbd(a.Seguradora)}</td><td>${escaparHtmlEbd(a.NumeroApolice)}</td><td>${escaparHtmlEbd(a.Tipo)}</td><td>${escaparHtmlEbd(a.vigencia)}</td><td>${escaparHtmlEbd(a.Coberturas)}</td></tr>`);
    html += "</tbody></table>";
    container.innerHTML = html;
  }

  const containerAlerta = document.getElementById("resultadoAlertasSeguros");
  const resA = await fetchProtegido(`${API_BASE}/seguros/alertas`);
  const d = await jsonDaTela(resA, containerAlerta, "objeto");
  if (d === null) return;
  let html = "";
  if (d.temploSedeSemCobertura) html += `<p class="subtitle">${escaparHtmlEbd(d.mensagemTemploSede)}</p>`;
  if (Array.isArray(d.vencidas) && d.vencidas.length > 0) {
    html += `<table class="tabela-frequencia"><thead><tr><th>Seguradora</th><th>Nº</th><th>Tipo</th><th>Fim</th></tr></thead><tbody>`;
    d.vencidas.forEach(a => html += `<tr><td>${escaparHtmlEbd(a.Seguradora)}</td><td>${escaparHtmlEbd(a.NumeroApolice)}</td><td>${escaparHtmlEbd(a.Tipo)}</td><td>${escaparHtmlEbd(a.DataFim.slice(0, 10))}</td></tr>`);
    html += "</tbody></table>";
  }
  if (!html) html = "<p class='subtitle'>Tudo em dia. ✅</p>";
  containerAlerta.innerHTML = html;
}

async function salvarApoliceAcao() {
  const tipo = document.getElementById("seguroTipo").value;
  const seguradora = document.getElementById("seguroSeguradora").value.trim();
  const numeroApolice = document.getElementById("seguroNumero").value.trim();
  const dataInicio = document.getElementById("seguroInicio").value;
  const dataFim = document.getElementById("seguroFim").value;
  const coberturas = document.getElementById("seguroCoberturas").value.split(",").map(c => c.trim().toUpperCase()).filter(Boolean);
  const valorPremio = document.getElementById("seguroPremio").value;
  const resultado = document.getElementById("resultadoApolice");
  if (!tipo || !seguradora || !numeroApolice || !dataInicio || !dataFim) { resultado.textContent = "Preencha todos os campos."; return; }
  const body = { tipo, seguradora, numeroApolice, dataInicio, dataFim, coberturas, valorPremio: valorPremio ? Number(valorPremio) : undefined };
  const res = await fetchProtegido(`${API_BASE}/seguros`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const d = await res.json();
  avisarResultado(d);
  resultado.textContent = d.mensagem;
  if (d.sucesso) carregarSegurosAcao();
}

// ---- PARÂMETROS MONETÁRIOS (v4.17) ----
async function carregarParametrosMonetariosAcao() {
  const container = document.getElementById("resultadoValoresMonetarios");
  const res = await fetchProtegido(`${API_BASE}/parametros-monetarios`);
  const lista = await jsonDaTela(res, container, "lista");
  if (lista === null) return;
  if (!Array.isArray(lista) || lista.length === 0) {
    container.innerHTML = "<p class='subtitle'>Nenhum valor cadastrado.</p>";
    return;
  }
  let html = `<table class="tabela-frequencia"><thead><tr><th>Sigla</th><th>Nome</th><th>Valor</th><th>Indexador</th><th>Última correção</th><th>Próxima</th><th></th></tr></thead><tbody>`;
  lista.forEach(v => html += `<tr><td>${escaparHtmlEbd(v.sigla)}</td><td>${escaparHtmlEbd(v.nome)}</td><td>${v.unidade === "%" ? escaparHtmlEbd(v.valor) + "%" : "R$ " + Number(v.valor).toFixed(2)}</td><td>${escaparHtmlEbd(v.indexador)}</td><td>${escaparHtmlEbd(v.dataUltimaCorrecao)}</td><td>${v.correcaoVencida ? "⚠️ vencida" : (escaparHtmlEbd(v.proximaCorrecao) || "-")}</td><td>${v.resolucaoNumero ? `Res. ${escaparHtmlEbd(v.resolucaoNumero)}` : ""}</td></tr>`);
  html += "</tbody></table>";
  container.innerHTML = html;
}

async function salvarValorMonetarioAcao() {
  const sigla = document.getElementById("valorMonetarioSigla").value.trim();
  const nome = document.getElementById("valorMonetarioNome").value.trim();
  const valor = document.getElementById("valorMonetarioValor").value;
  const unidade = document.getElementById("valorMonetarioUnidade").value;
  const resultado = document.getElementById("resultadoValorMonetario");
  if (!sigla || !nome || !valor) { resultado.textContent = "Preencha sigla, nome e valor."; return; }
  const body = { sigla, nome, valor: Number(valor), unidade };
  const res = await fetchProtegido(`${API_BASE}/parametros-monetarios`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const d = await res.json();
  avisarResultado(d);
  resultado.textContent = d.mensagem;
  if (d.sucesso) carregarParametrosMonetariosAcao();
}

async function corrigirTodosValoresAcao() {
  const percentual = document.getElementById("valorMonetarioPercentual").value;
  if (!percentual || Number(percentual) <= 0) { mostrarToast("Informe o percentual de correção.", "erro"); return; }
  const res = await fetchProtegido(`${API_BASE}/parametros-monetarios/corrigir-todos`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ percentual: Number(percentual) }) });
  const d = await res.json();
  avisarResultado(d);
  carregarParametrosMonetariosAcao();
}

// ---- CESSÃO DE TEMPLO (v4.18) ----
async function carregarCessoesTemploAcao() {
  const container = document.getElementById("resultadoCessoes");
  const res = await fetchProtegido(`${API_BASE}/cessoes-templo`);
  const lista = await jsonDaTela(res, container, "lista");
  if (lista === null) return;
  if (!Array.isArray(lista) || lista.length === 0) {
    container.innerHTML = "<p class='subtitle'>Nenhuma cessão registrada.</p>";
    return;
  }
  let html = `<table class="tabela-frequencia"><thead><tr><th>Solicitante</th><th>Tipo</th><th>Data</th><th>Taxa</th><th>Lista</th><th>Status</th><th></th></tr></thead><tbody>`;
  // Cancelar uma cessão já autorizada estorna a conta a receber junto; se a taxa já foi recebida o servidor recusa e explica o caminho (a devolução é um ato financeiro à parte).
  lista.forEach(c => html += `<tr><td>${escaparHtmlEbd(c.solicitanteNome)}</td><td>${escaparHtmlEbd(c.tipoEvento)}</td><td>${escaparHtmlEbd(c.dataEvento.slice(0, 10))}</td><td>${c.isencaoTaxa ? "isento" : "R$ " + Number(c.taxaZeladoria).toFixed(2)}</td><td>${c.listaMusicalAprovada ? "✅" : "❌"}</td><td>${escaparHtmlEbd(c.status)}${c.contaReceberStatus ? `<br /><small>cobrança: ${escaparHtmlEbd(c.contaReceberStatus)}</small>` : ""}</td>
    <td class="acoes-inline">${c.status === "SOLICITADA" || (c.status === "AUTORIZADA" && (authGeral || c.contaReceberId == null)) ? `<button class="btn-link btn-link-perigo" data-on-click="cancelarCessaoTemploAcao" data-args-click="${argsAttr(Number(c.cessaoId))}">Cancelar</button>` : ""}</td></tr>`);
  html += "</tbody></table>";
  container.innerHTML = html;
}

async function cancelarCessaoTemploAcao(cessaoId) {
  const motivo = await pedirTexto("Motivo do cancelamento da cessão", "Ex: o solicitante desistiu do evento");
  if (motivo === null) return;
  const res = await fetchProtegido(`${API_BASE}/cessoes-templo/${cessaoId}`, {
    method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ acao: "CANCELAR", motivo })
  });
  const d = await res.json();
  avisarResultado(d);
  document.getElementById("resultadoCessao").textContent = d.mensagem; // a recusa por recebimento já feito traz o caminho em vários passos: fica na tela
  if (d.sucesso) carregarCessoesTemploAcao();
}

async function salvarCessaoTemploAcao() {
  const congregacaoId = document.getElementById("cessaoCongregacao").value;
  const solicitanteNome = document.getElementById("cessaoSolicitante").value.trim();
  const tipoEvento = document.getElementById("cessaoTipoEvento").value;
  const dataEvento = document.getElementById("cessaoDataEvento").value;
  const taxaZeladoria = document.getElementById("cessaoTaxa").value;
  const listaMusicalAprovada = document.getElementById("cessaoListaMusical").checked;
  const resultado = document.getElementById("resultadoCessao");
  if (!congregacaoId || !solicitanteNome || !dataEvento) { resultado.textContent = "Preencha congregação, solicitante e data."; return; }
  const body = { congregacaoId: Number(congregacaoId), solicitanteNome, tipoEvento, dataEvento, taxaZeladoria: Number(taxaZeladoria || 0), listaMusicalAprovada };
  const res = await fetchProtegido(`${API_BASE}/cessoes-templo`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const d = await res.json();
  avisarResultado(d);
  resultado.textContent = d.mensagem;
  if (d.sucesso) carregarCessoesTemploAcao();
}

// ---- OBRIGAÇÕES FISCAIS (v4.19) ----
async function carregarObrigacoesFiscaisAcao() {
  const container = document.getElementById("resultadoObrigacoes");
  const res = await fetchProtegido(`${API_BASE}/obrigacoes-fiscais`);
  const lista = await jsonDaTela(res, container, "lista");
  if (lista === null) return;
  if (!Array.isArray(lista) || lista.length === 0) {
    container.innerHTML = "<p class='subtitle'>Nenhuma obrigação registrada.</p>";
  } else {
    let html = `<table class="tabela-frequencia"><thead><tr><th>Tipo</th><th>Ano</th><th>Prazo</th><th>Status</th><th>Alerta</th></tr></thead><tbody>`;
    lista.forEach(o => html += `<tr><td>${escaparHtmlEbd(o.Tipo)}</td><td>${escaparHtmlEbd(o.AnoReferencia)}</td><td>${escaparHtmlEbd(o.PrazoEntrega.slice(0, 10))}</td><td>${escaparHtmlEbd(o.Status)}${o.vencida ? " (vencida)" : ""}</td><td>${escaparHtmlEbd(o.alerta) || "-"}</td></tr>`);
    html += "</tbody></table>";
    container.innerHTML = html;
  }

  const containerRet = document.getElementById("resultadoRetencoes");
  const resR = await fetchProtegido(`${API_BASE}/obrigacoes-fiscais/retencoes`);
  const ret = await jsonDaTela(resR, containerRet, "lista");
  if (ret === null) return;
  if (!Array.isArray(ret) || ret.length === 0) {
    containerRet.innerHTML = "<p class='subtitle'>Nenhuma retenção registrada.</p>";
  } else {
    let html = `<table class="tabela-frequencia"><thead><tr><th>Natureza</th><th>Competência</th><th>Base</th><th>Retido</th><th>Status</th></tr></thead><tbody>`;
    ret.forEach(r => html += `<tr><td>${escaparHtmlEbd(r.NaturezaRendimento)}</td><td>${escaparHtmlEbd(r.Competencia)}</td><td>R$ ${Number(r.ValorBase).toFixed(2)}</td><td>R$ ${Number(r.ValorRetido).toFixed(2)}</td><td>${escaparHtmlEbd(r.Status)}</td></tr>`);
    html += "</tbody></table>";
    containerRet.innerHTML = html;
  }
}

async function carregarMedidorEcdAcao() {
  const container = document.getElementById("resultadoMedidorEcd");
  const res = await fetchProtegido(`${API_BASE}/obrigacoes-fiscais/medidor-ecd`);
  const d = await jsonDaTela(res, container, "objeto");
  if (d === null) return;
  container.innerHTML = `<p class="subtitle">Receita ${escaparHtmlEbd(d.ano)}: R$ ${Number(d.receitaExercicio).toFixed(2)} · Gatilho ECD: R$ ${Number(d.gatilhoEcd).toFixed(2)} · ${escaparHtmlEbd(d.percentual)}%${d.ultrapassou ? " ⚠️ ECD obrigatória!" : ""}</p>`;
}

async function salvarObrigacaoFiscalAcao() {
  const tipo = document.getElementById("obrigacaoTipo").value;
  const anoReferencia = document.getElementById("obrigacaoAno").value;
  const cnpj = document.getElementById("obrigacaoCnpj").value.trim();
  const prazoEntrega = document.getElementById("obrigacaoPrazo").value;
  const resultado = document.getElementById("resultadoObrigacao");
  if (!anoReferencia || !cnpj || !prazoEntrega) { resultado.textContent = "Preencha ano, CNPJ e prazo."; return; }
  const body = { tipo, anoReferencia: Number(anoReferencia), cnpj, prazoEntrega };
  const res = await fetchProtegido(`${API_BASE}/obrigacoes-fiscais`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const d = await res.json();
  avisarResultado(d);
  resultado.textContent = d.mensagem;
  if (d.sucesso) carregarObrigacoesFiscaisAcao();
}

async function salvarRetencaoAcao() {
  const naturezaRendimento = document.getElementById("retencaoNatureza").value;
  const competencia = document.getElementById("retencaoCompetencia").value;
  const valorBase = document.getElementById("retencaoBase").value;
  const valorRetido = document.getElementById("retencaoRetido").value;
  if (!competencia || !valorBase || !valorRetido) { mostrarToast("Preencha competência, base e retido.", "erro"); return; }
  const body = { naturezaRendimento, competencia, valorBase: Number(valorBase), valorRetido: Number(valorRetido) };
  const res = await fetchProtegido(`${API_BASE}/obrigacoes-fiscais/retencoes`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const d = await res.json();
  avisarResultado(d);
  carregarObrigacoesFiscaisAcao();
}

async function carregarInformeRendimentosAcao() {
  const ano = document.getElementById("informeAno").value || new Date().getFullYear();
  const container = document.getElementById("resultadoInformeRendimentos");
  const res = await fetchProtegido(`${API_BASE}/informes-rendimentos/${ano}`);
  const d = await jsonDaTela(res, container, "objeto");
  if (d === null) return;
  let html = `<p class="subtitle">Informe de Rendimentos ${escaparHtmlEbd(d.anoReferencia)} — Ministros: ${d.ministros.length} · Prestadores: ${d.prestadores.length}</p>`;
  if (d.ministros.length > 0) {
    html += `<h5>Ministros</h5><table class="tabela-frequencia"><thead><tr><th>Nome</th><th>CPF</th><th>Total</th><th>IRRF</th></tr></thead><tbody>`;
    d.ministros.forEach(m => html += `<tr><td>${escaparHtmlEbd(m.nome)}</td><td>${escaparHtmlEbd(m.cpfCnpj)}</td><td>R$ ${Number(m.valorTotal).toFixed(2)}</td><td>R$ ${Number(m.irrfRetido).toFixed(2)}</td></tr>`);
    html += "</tbody></table>";
  }
  if (d.prestadores.length > 0) {
    html += `<h5>Prestadores</h5><table class="tabela-frequencia"><thead><tr><th>Nome</th><th>CPF/CNPJ</th><th>Total</th></tr></thead><tbody>`;
    d.prestadores.forEach(p => html += `<tr><td>${escaparHtmlEbd(p.nome)}</td><td>${escaparHtmlEbd(p.cpfCnpj)}</td><td>R$ ${Number(p.valorTotal).toFixed(2)}</td></tr>`);
    html += "</tbody></table>";
  }
  container.innerHTML = html;
}

// ---- IMUNIDADE TRIBUTÁRIA (v4.20) ----
async function carregarImunidadeTributariaAcao() {
  const res = await fetchProtegido(`${API_BASE}/imunidade-tributaria`);
  const d = await jsonDaTela(res, document.getElementById("resultadoSemaforo"), "objeto");
  if (d === null) return;

  const sem = d.semaforo || {};
  const cores = { VERDE: "🟢", ATENCAO: "🟡" };
  const semaforo = document.getElementById("resultadoSemaforo");
  let html = `<p class="subtitle">Semáforo geral: ${cores[sem.semaforoGeral] || "⚪"} ${escaparHtmlEbd(sem.semaforoGeral)}</p>`;
  [sem.requisitoI, sem.requisitoII, sem.requisitoIII].forEach(r => {
    if (!r) return;
    html += `<p><strong>${r.ok ? "✅" : "⚠️"} ${escaparHtmlEbd(r.rotulo)}</strong>`;
    if (r.rotulo.indexOf("distribuir") !== -1) html += ` — ${escaparHtmlEbd(r.pagamentosAMinistros)} pagamento(s) a ministros, ${r.foraRubrica.length} fora de rubrica`;
    if (r.rotulo.indexOf("País") !== -1) html += ` — ${r.remessasExterior.length} remessa(s) ao exterior`;
    if (r.rotulo.indexOf("Escrituração") !== -1) html += ` — ${escaparHtmlEbd(r.pctComprovante)}% com comprovante`;
    html += "</p>";
  });
  semaforo.innerHTML = html;

  const conflitos = d.conflitosInteresse || [];
  const containerC = document.getElementById("resultadoConflitos");
  if (conflitos.length === 0) {
    containerC.innerHTML = "<p class='subtitle'>Nenhum conflito detectado. ✅</p>";
  } else {
    let h = `<table class="tabela-frequencia"><thead><tr><th>Ministro</th><th>Aprovador</th><th>Fornecedor</th><th>Valor</th></tr></thead><tbody>`;
    conflitos.forEach(c => h += `<tr><td>${escaparHtmlEbd(c.ministro)}</td><td>${escaparHtmlEbd(c.aprovadorNome)}</td><td>${escaparHtmlEbd(c.fornecedor)}</td><td>R$ ${Number(c.valor).toFixed(2)}</td></tr>`);
    h += "</tbody></table>";
    containerC.innerHTML = h;
  }

  const carga = d.cargaTributaria || {};
  document.getElementById("resultadoCarga").innerHTML =
    `<p class="subtitle">Compras ${escaparHtmlEbd(carga.ano)}: R$ ${Number(carga.totalCompras || 0).toFixed(2)} · Tributos embutidos: R$ ${Number(carga.totalTributosEmbutidos || 0).toFixed(2)} (${escaparHtmlEbd(carga.pctCargaEmbutida) || 0}%)</p>`;
}

async function carregarDossieFiscalAcao() {
  const ano = document.getElementById("dossieAno").value || new Date().getFullYear();
  const container = document.getElementById("resultadoDossie");
  const res = await fetchProtegido(`${API_BASE}/dossie-fiscal/${ano}`);
  const d = await jsonDaTela(res, container, "objeto");
  if (d === null) return;
  const demonstracoes = d.demonstracoes || {};
  let html = `<p class="subtitle">Dossiê fiscal ${escaparHtmlEbd(d.anoReferencia)} — pacote de defesa</p>`;
  html += `<ul>`;
  if (demonstracoes.balanco) html += `<li>Balanço Patrimonial: Ativo R$ ${Number(demonstracoes.balanco.ativo.total).toFixed(2)} · PL R$ ${Number(demonstracoes.balanco.patrimonioLiquido).toFixed(2)}</li>`;
  if (demonstracoes.drp) html += `<li>Resultado do Período: R$ ${Number(demonstracoes.drp.resultadoDoPeriodo).toFixed(2)}</li>`;
  html += `<li>Balancetes: ${(d.balancetes || []).length} fechamento(s)</li>`;
  html += `<li>Comprovantes: ${(d.comprovantes || []).length} documento(s)</li>`;
  html += `<li>Atas de aprovação: ${(d.atasAprovacaoContas || []).length} parecer(es)</li>`;
  html += `</ul>`;
  container.innerHTML = html;
}

// ---- RECEITAS ACESSÓRIAS E IMÓVEIS (v4.21) ----
async function registrarReceitaAcessoriaAcao() {
  const body = {
    tipo: document.getElementById("receitaAcessoriaTipo").value,
    bemId: document.getElementById("receitaAcessoriaBemId").value || null,
    eventoDescricao: document.getElementById("receitaAcessoriaEvento").value || null,
    valor: document.getElementById("receitaAcessoriaValor").value,
    dataRecebimento: document.getElementById("receitaAcessoriaData").value,
    aplicacaoFinalisticaDescricao: document.getElementById("receitaAcessoriaAplicacao").value
  };
  const res = await fetchProtegido(`${API_BASE}/receitas-acessorias`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const d = await res.json();
  alert(d.mensagem);
  if (d.sucesso) {
    document.getElementById("receitaAcessoriaBemId").value = "";
    document.getElementById("receitaAcessoriaEvento").value = "";
    document.getElementById("receitaAcessoriaValor").value = "";
    document.getElementById("receitaAcessoriaData").value = "";
    document.getElementById("receitaAcessoriaAplicacao").value = "";
    carregarReceitasAcessoriasAcao();
    carregarRelatorioOrigemDestinoAcao();
  }
}

async function carregarReceitasAcessoriasAcao() {
  const container = document.getElementById("resultadoReceitasAcessorias");
  const res = await fetchProtegido(`${API_BASE}/receitas-acessorias`);
  const lista = await jsonDaTela(res, container, "lista");
  if (lista === null) return;
  if (!Array.isArray(lista) || lista.length === 0) {
    container.innerHTML = "<p class='subtitle'>Nenhuma receita acessória registrada.</p>";
    return;
  }
  let html = `<table class="tabela-frequencia"><thead><tr><th>Data</th><th>Tipo</th><th>Imóvel/Evento</th><th>Valor</th><th>Aplicação finalística</th><th>Comprovada</th></tr></thead><tbody>`;
  lista.forEach(r => {
    html += `<tr><td>${escaparHtmlEbd(r.dataRecebimento)}</td><td>${escaparHtmlEbd(r.tipo)}</td><td>${escaparHtmlEbd(r.bemDescricao) || escaparHtmlEbd(r.eventoDescricao) || "-"}</td><td>R$ ${Number(r.valor).toFixed(2)}</td><td>${escaparHtmlEbd(r.aplicacaoFinalisticaDescricao)}</td><td>${r.cancelada ? `❌ cancelada<br /><small>${escaparHtmlEbd(r.motivoCancelamento || "")}</small>` : r.comprovada ? "✅" : "⏳ pendente"}</td></tr>`;
  });
  html += "</tbody></table>";
  container.innerHTML = html;
}

async function carregarRelatorioOrigemDestinoAcao() {
  const container = document.getElementById("resultadoOrigemDestino");
  const res = await fetchProtegido(`${API_BASE}/receitas-acessorias/relatorio-origem-destino`);
  const lista = await jsonDaTela(res, container, "lista");
  if (lista === null) return;
  if (!Array.isArray(lista) || lista.length === 0) {
    container.innerHTML = "<p class='subtitle'>Sem lançamentos ainda.</p>";
    return;
  }
  let html = `<table class="tabela-frequencia"><thead><tr><th>Imóvel/Evento</th><th>Lançamentos</th><th>Arrecadado</th><th>Comprovado</th><th>Pendente</th></tr></thead><tbody>`;
  lista.forEach(g => {
    html += `<tr><td>${escaparHtmlEbd(g.origemDestino)}</td><td>${escaparHtmlEbd(g.lancamentos)}</td><td>R$ ${g.totalArrecadado.toFixed(2)}</td><td>R$ ${g.totalComprovado.toFixed(2)}</td><td>R$ ${g.totalPendente.toFixed(2)}</td></tr>`;
  });
  html += "</tbody></table>";
  container.innerHTML = html;
}

async function carregarImoveisAcao() {
  const container = document.getElementById("resultadoImoveis");
  const res = await fetchProtegido(`${API_BASE}/imoveis`);
  const lista = await jsonDaTela(res, container, "lista");
  if (lista === null) return;
  if (!Array.isArray(lista) || lista.length === 0) {
    container.innerHTML = "<p class='subtitle'>Nenhum imóvel cadastrado no Patrimônio (v4.11, Tipo = IMOVEL).</p>";
    return;
  }
  let html = `<table class="tabela-frequencia"><thead><tr><th>Imóvel</th><th>IPTU</th><th>AVCB</th><th>Alvará/Habite-se</th><th>Alerta</th></tr></thead><tbody>`;
  lista.forEach(i => {
    html += `<tr><td>${escaparHtmlEbd(i.descricao)} (bemId ${i.bemId})</td><td>${escaparHtmlEbd(i.iptuStatus) || "-"} — ${escaparHtmlEbd(i.iptuVigenciaFim) || "-"} (${escaparHtmlEbd(i.vigenciaIptu)})</td>
      <td>${escaparHtmlEbd(i.avcbVigenciaFim) || "-"} (${escaparHtmlEbd(i.vigenciaAvcb)})</td><td>${escaparHtmlEbd(i.alvaraVigenciaFim) || "-"} (${escaparHtmlEbd(i.vigenciaAlvara)})</td>
      <td>${i.alertaRenovacao ? "⚠️ renovar" : "✅"}${i.impedidoReceberCulto ? "<br>⚠️ AVCB vencido (alerta)" : ""}</td></tr>`;
  });
  html += "</tbody></table>";
  container.innerHTML = html;
}

async function salvarImovelAcao() {
  const bemId = document.getElementById("imovelBemId").value;
  if (!bemId) { alert("Informe o bemId do imóvel."); return; }
  const body = {
    iptuStatus: document.getElementById("imovelIptuStatus").value,
    iptuNumeroProcesso: document.getElementById("imovelIptuProcesso").value || null,
    iptuVigenciaFim: document.getElementById("imovelIptuFim").value || null,
    avcbNumero: document.getElementById("imovelAvcbNumero").value || null,
    avcbVigenciaFim: document.getElementById("imovelAvcbFim").value || null,
    alvaraNumero: document.getElementById("imovelAlvaraNumero").value || null,
    alvaraVigenciaFim: document.getElementById("imovelAlvaraFim").value || null
  };
  const arquivoAvcb = document.getElementById("imovelAvcbDocumento").files[0];
  const arquivoAlvara = document.getElementById("imovelAlvaraDocumento").files[0];
  if (arquivoAvcb) { body.avcbDocumentoBase64 = await arquivoParaBase64(arquivoAvcb); body.mimeType = arquivoAvcb.type; }
  if (arquivoAlvara) { body.alvaraDocumentoBase64 = await arquivoParaBase64(arquivoAlvara); body.mimeType = arquivoAlvara.type; }
  const res = await fetchProtegido(`${API_BASE}/imoveis/${bemId}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const d = await res.json();
  alert(d.mensagem);
  if (d.sucesso) carregarImoveisAcao();
}

// ---- OBRAS, LICENCIAMENTO E INAUGURAÇÃO DE TEMPLOS (v4.24) ----
async function carregarObrasAcao() {
  const container = document.getElementById("resultadoObras");
  const res = await fetchProtegido(`${API_BASE}/obras`);
  const lista = await jsonDaTela(res, container, "lista");
  if (lista === null) return;
  if (!Array.isArray(lista) || lista.length === 0) {
    container.innerHTML = "<p class='subtitle'>Nenhuma obra cadastrada.</p>";
    return;
  }
  let html = `<table class="tabela-frequencia"><thead><tr><th>Id</th><th>Título</th><th>Congregação</th><th>Status</th><th>Ações</th></tr></thead><tbody>`;
  lista.forEach(o => {
    html += `<tr><td>${o.ObraId}</td><td>${escaparHtmlEbd(o.Titulo)}</td><td>${escaparHtmlEbd(o.congregacaoNome)}</td><td>${escaparHtmlEbd(o.Status)}</td>
      <td>
        ${!o.DataPedraFundamental ? `<button class="btn-confirmar" style="width:auto;padding:4px 8px;" data-on-click="acaoObra" data-args-click="${argsAttr(o.ObraId, "MARCAR_PEDRA_FUNDAMENTAL")}">Pedra fundamental</button>` : ""}
        <button class="btn-confirmar" style="width:auto;padding:4px 8px;" data-on-click="acaoObra" data-args-click="${argsAttr(o.ObraId, "CONFIRMAR_PLACA")}">Confirmar placa</button>
        ${o.EhObraNova ? `<button class="btn-confirmar" style="width:auto;padding:4px 8px;" data-on-click="acaoObra" data-args-click="${argsAttr(o.ObraId, "CONFIRMAR_EFICIENCIA_ENERGETICA")}">Confirmar eficiência energética</button>` : ""}
        <button class="btn-confirmar" style="width:auto;padding:4px 8px;" data-on-click="acaoObra" data-args-click="${argsAttr(o.ObraId, "INAUGURAR")}">🏁 Inaugurar</button>
      </td></tr>`;
  });
  html += "</tbody></table>";
  container.innerHTML = html;
}

async function registrarObraAcao() {
  const body = {
    congregacaoId: document.getElementById("obraCongregacao").value,
    bemId: document.getElementById("obraBemId").value || null,
    titulo: document.getElementById("obraTitulo").value,
    ehObraNova: document.getElementById("obraNova").value === "1",
    orcamentoPrevisto: document.getElementById("obraOrcamento").value,
    dataInicioPrevista: document.getElementById("obraInicio").value,
    dataFimPrevista: document.getElementById("obraFim").value
  };
  const res = await fetchProtegido(`${API_BASE}/obras`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const d = await res.json();
  alert(d.mensagem);
  if (d.sucesso) { document.getElementById("obraTitulo").value = ""; carregarObrasAcao(); }
}

async function acaoObra(obraId, acao) {
  let body = { acao };
  if (acao === "MARCAR_PEDRA_FUNDAMENTAL") {
    const data = prompt("Data da pedra fundamental (AAAA-MM-DD):", new Date().toISOString().slice(0, 10));
    if (!data) return;
    body.dataPedraFundamental = data;
  }
  if (acao === "CONFIRMAR_PLACA") {
    if (!confirm("Confirma que os nomes obrigatórios estão na placa e que NÃO há nome de doador/político (Art. 87 §3º)?")) return;
    body.nomesConfirmados = true;
    body.semDoadorPoliticoConfirmado = true;
  }
  const res = await fetchProtegido(`${API_BASE}/obras/${obraId}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const d = await res.json();
  alert(d.mensagem);
  if (d.sucesso) carregarObrasAcao();
}

async function registrarObraMarcoAcao() {
  const body = {
    obraId: document.getElementById("marcoObraId").value,
    descricao: document.getElementById("obraMarcoDescricao").value,
    dataPrevista: document.getElementById("obraMarcoData").value,
    percentualFisicoPrevisto: document.getElementById("marcoPercentual").value,
    valorPrevisto: document.getElementById("marcoValor").value
  };
  const res = await fetchProtegido(`${API_BASE}/obra-marcos`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const d = await res.json();
  alert(d.mensagem);
  if (d.sucesso) {
    document.getElementById("obraMarcoDescricao").value = "";
    const res2 = await fetchProtegido(`${API_BASE}/obra-marcos?obraId=${body.obraId}`);
    const marcos = await res2.json();
    const container = document.getElementById("resultadoObraMarcos");
    let html = `<table class="tabela-frequencia"><thead><tr><th>Descrição</th><th>Prevista</th><th>% Previsto</th><th>% Realizado</th><th>Valor previsto</th></tr></thead><tbody>`;
    (Array.isArray(marcos) ? marcos : []).forEach(m => html += `<tr><td>${escaparHtmlEbd(m.Descricao)}</td><td>${escaparHtmlEbd(m.DataPrevista)}</td><td>${escaparHtmlEbd(m.PercentualFisicoPrevisto)}%</td><td>${escaparHtmlEbd(m.PercentualFisicoRealizado)}%</td><td>R$ ${Number(m.ValorPrevisto).toFixed(2)}</td></tr>`);
    html += "</tbody></table>";
    container.innerHTML = html;
  }
}

// ---- CONTAS A RECEBER (v4.6) — valor esperado, ainda não recebido; não
// conta no Centro de Custo até a confirmação virar um LancamentoTesouraria
// de verdade. "Vencido" é calculado na leitura, nunca marcado à mão.
function alternarFormNovaContaReceber() {
  const form = document.getElementById("formNovaContaReceber");
  form.style.display = form.style.display === "none" ? "block" : "none";
}

async function carregarOpcoesDizimistasReceber() {
  const congregacaoId = document.getElementById("receberCongregacao").value;
  const select = document.getElementById("receberDizimista");
  if (!congregacaoId) { select.innerHTML = `<option value="">— Nome avulso (abaixo) —</option>`; return; }
  const res = await fetchProtegido(`${API_BASE}/dizimistas?congregacaoId=${congregacaoId}`);
  const dizimistas = await jsonDaTela(res, select, "lista");
  if (dizimistas === null) return;
  select.innerHTML = `<option value="">— Nome avulso (abaixo) —</option>` +
    (Array.isArray(dizimistas) ? dizimistas.map(d => `<option value="${d.dizimistaId}">${escaparHtmlEbd(d.nome)}</option>`).join("") : "");
}

async function salvarContaReceberAcao() {
  const congregacaoId = document.getElementById("receberCongregacao").value;
  const dizimistaId = document.getElementById("receberDizimista").value;
  const nomeAvulso = document.getElementById("receberNomeAvulso").value.trim();
  const tipo = document.getElementById("receberTipo").value;
  const valor = document.getElementById("receberValor").value;
  const dataVencimento = document.getElementById("receberDataVencimento").value;
  const campanhaId = document.getElementById("receberCampanha").value;
  const descricao = document.getElementById("receberDescricao").value.trim();
  const resultado = document.getElementById("resultadoNovaContaReceber");
  if (!congregacaoId || !tipo || !valor || !dataVencimento) {
    resultado.textContent = "Preencha congregação, categoria, valor e data de vencimento.";
    return;
  }
  const body = {
    congregacaoId, dizimistaId: dizimistaId || undefined, nomeAvulso: dizimistaId ? undefined : (nomeAvulso || undefined),
    tipo, descricao: descricao || undefined, valor: Number(valor), dataVencimento, campanhaId: campanhaId || undefined
  };
  const res = await fetchProtegido(`${API_BASE}/contas-receber`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body)
  });
  const data = await res.json();
  avisarResultado(data);
  resultado.textContent = data.mensagem;
  if (data.sucesso) {
    document.getElementById("receberNomeAvulso").value = "";
    document.getElementById("receberValor").value = "";
    document.getElementById("receberDataVencimento").value = "";
    document.getElementById("receberDescricao").value = "";
    document.getElementById("formNovaContaReceber").style.display = "none";
    carregarContasReceber();
  }
}

function badgeStatusContaReceber(status) {
  const mapa = { PREVISTO: "badge-licenca", VENCIDO: "badge-pendente", RECEBIDO: "badge-ativo", CANCELADO: "badge-desligado" };
  return `<span class="badge-status ${mapa[status] || "badge-inativo"}">${escaparHtmlEbd(status)}</span>`;
}

async function carregarContasReceber() {
  const congregacaoId = document.getElementById("receberFiltroCongregacao").value;
  const status = document.getElementById("receberFiltroStatus").value;
  const container = document.getElementById("resultadoContasReceber");
  const params = new URLSearchParams();
  if (congregacaoId) params.set("congregacaoId", congregacaoId);
  if (status) params.set("status", status);
  const res = await fetchProtegido(`${API_BASE}/contas-receber?${params.toString()}`);
  const contas = await jsonDaTela(res, container, "lista");
  if (contas === null) return;
  if (!Array.isArray(contas) || contas.length === 0) {
    container.innerHTML = "<p class='subtitle'>Nenhuma conta a receber encontrada.</p>";
    return;
  }
  let html = `<table class="tabela-frequencia"><thead><tr><th>Congregação</th><th>Nome/Descrição</th><th>Categoria</th><th>Valor</th><th>Vencimento</th><th>Status</th><th></th></tr></thead><tbody>`;
  contas.forEach(c => {
    html += `<tr>
      <td>${escaparHtmlEbd(c.congregacaoNome)}</td><td>${escaparHtmlEbd(c.dizimistaNome) || escaparHtmlEbd(c.nomeAvulso) || escaparHtmlEbd(c.descricao) || "—"}</td><td>${escaparHtmlEbd(c.categoriaNome) || escaparHtmlEbd(c.tipo)}</td>
      <td>R$ ${Number(c.valor).toFixed(2)}</td><td>${escaparHtmlEbd(c.dataVencimento)}</td><td>${badgeStatusContaReceber(c.status)}</td>
      <td class="acoes-inline"><button class="btn-link" data-on-click="verDetalheContaReceberAcao" data-args-click="${argsAttr(c.contaReceberId)}">Ver detalhe</button></td>
    </tr>`;
  });
  html += "</tbody></table>";
  container.innerHTML = html;
}

async function verDetalheContaReceberAcao(contaReceberId) {
  const container = document.getElementById("detalheContaReceber");
  const res = await fetchProtegido(`${API_BASE}/contas-receber/${contaReceberId}`);
  const c = await jsonDaTela(res, container, "objeto");
  if (c === null) return;
  if (c.sucesso === false) { container.innerHTML = `<p class="subtitle">${escaparHtmlEbd(c.mensagem)}</p>`; return; }

  let html = `<hr /><h4>${escaparHtmlEbd(c.dizimistaNome) || escaparHtmlEbd(c.nomeAvulso) || escaparHtmlEbd(c.descricao) || "—"} — R$ ${Number(c.valor).toFixed(2)} ${badgeStatusContaReceber(c.status)}</h4>
    <p class="subtitle">${escaparHtmlEbd(c.categoriaNome)} — vencimento ${escaparHtmlEbd(c.dataVencimento)}${c.campanhaNome ? ` — campanha: ${escaparHtmlEbd(c.campanhaNome)}` : ""}</p>`;
  if (c.diasParaVencimento < 0 && c.status !== "RECEBIDO" && c.status !== "CANCELADO") {
    html += `<p class="subtitle">⚠️ Vencida há ${Math.abs(c.diasParaVencimento)} dia(s).</p>`;
  } else if (c.status === "PREVISTO") {
    html += `<p class="subtitle">Faltam ${escaparHtmlEbd(c.diasParaVencimento)} dia(s) pro vencimento.</p>`;
  }
  if (c.motivoCancelamento) html += `<p class="subtitle">Motivo do cancelamento: ${escaparHtmlEbd(c.motivoCancelamento)}</p>`;

  if (c.status === "PREVISTO" || c.status === "VENCIDO") {
    html += `
      <h4 style="margin:16px 0 8px; color: var(--cor-primaria);">Confirmar recebimento</h4>
      <div class="barra-lista">
        <select id="receberConfirmarForma_${contaReceberId}">
          <option value="DINHEIRO">Dinheiro</option>
          <option value="PIX">PIX</option>
          <option value="MISTO">Misto</option>
        </select>
        <input type="number" id="receberConfirmarValorPix_${contaReceberId}" placeholder="Parte em PIX (se misto)" min="0.01" step="0.01" style="max-width:170px;" />
        <input type="month" id="receberConfirmarMes_${contaReceberId}" value="${mesAtualFinanceiro()}" style="max-width:150px;" />
      </div>
      <div class="input-group">
        <label>Comprovante (opcional):</label>
        <input type="file" id="receberConfirmarComprovante_${contaReceberId}" accept="image/jpeg,image/png,application/pdf" />
      </div>
      <button class="btn-confirmar" style="width:auto;" data-on-click="confirmarContaReceberAcao" data-args-click="${argsAttr(contaReceberId)}">✅ Confirmar Recebimento</button>
      <button class="btn-link btn-link-perigo" data-on-click="cancelarContaReceberAcao" data-args-click="${argsAttr(contaReceberId)}">Cancelar</button>
      <p id="resultadoConfirmarContaReceber_${contaReceberId}" class="subtitle"></p>`;
  }
  if (c.lancamentoId) {
    html += `<p class="subtitle">Virou o lançamento nº ${c.lancamentoId} na Tesouraria.</p>`;
  }
  container.innerHTML = html;
}

async function confirmarContaReceberAcao(contaReceberId) {
  const formaPagamento = document.getElementById(`receberConfirmarForma_${contaReceberId}`).value;
  const valorPix = document.getElementById(`receberConfirmarValorPix_${contaReceberId}`).value;
  const mesReferencia = document.getElementById(`receberConfirmarMes_${contaReceberId}`).value;
  const arquivo = document.getElementById(`receberConfirmarComprovante_${contaReceberId}`).files[0];
  const resultado = document.getElementById(`resultadoConfirmarContaReceber_${contaReceberId}`);
  if (!mesReferencia) { resultado.textContent = "Informe o mês de referência."; return; }
  const body = { acao: "CONFIRMAR", formaPagamento, mesReferencia };
  if (formaPagamento === "MISTO") body.valorPix = Number(valorPix);
  if (arquivo) { body.comprovanteBase64 = await arquivoParaBase64(arquivo); body.mimeType = arquivo.type; }
  const res = await fetchProtegido(`${API_BASE}/contas-receber/${contaReceberId}`, {
    method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body)
  });
  const data = await res.json();
  avisarResultado(data);
  resultado.textContent = data.mensagem;
  if (data.sucesso) { carregarContasReceber(); verDetalheContaReceberAcao(contaReceberId); }
}

async function cancelarContaReceberAcao(contaReceberId) {
  const motivo = await pedirTexto("Motivo do cancelamento", "Ex: acordo desfeito");
  if (motivo === null) return;
  if (!motivo.trim()) { mostrarToast("Informe o motivo do cancelamento.", "erro"); return; }
  const res = await fetchProtegido(`${API_BASE}/contas-receber/${contaReceberId}`, {
    method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ acao: "CANCELAR", motivo })
  });
  const data = await res.json();
  avisarResultado(data);
  if (data.sucesso) { carregarContasReceber(); verDetalheContaReceberAcao(contaReceberId); }
}

// O antigo onchange="carregarOpcoesDizimistas(); carregarLancamentosTesouraria();" da congregação dos lançamentos (CSP forte): as duas cargas, na
// mesma ordem e sem esperar uma pela outra, como antes.
function aoTrocarCongregacaoLancamentos() {
  carregarOpcoesDizimistas();
  carregarLancamentosTesouraria();
}

async function carregarOpcoesDizimistas() {
  const congregacaoId = document.getElementById("financeiroLancCongregacao").value;
  const select = document.getElementById("financeiroLancDizimista");
  if (!congregacaoId) { select.innerHTML = `<option value="">— Nome avulso (abaixo) —</option>`; return; }
  const res = await fetchProtegido(`${API_BASE}/dizimistas?congregacaoId=${congregacaoId}`);
  const dizimistas = await jsonDaTela(res, select, "lista");
  if (dizimistas === null) return;
  select.innerHTML = `<option value="">— Nome avulso (abaixo) —</option>` +
    (Array.isArray(dizimistas) ? dizimistas.map(d => `<option value="${d.dizimistaId}">${escaparHtmlEbd(d.nome)}</option>`).join("") : "");
}

async function salvarDizimistaAcao() {
  const congregacaoId = document.getElementById("financeiroLancCongregacao").value;
  const nome = document.getElementById("financeiroNovoDizimistaNome").value.trim();
  const msg = document.getElementById("resultadoDizimista");
  if (!congregacaoId || !nome) { msg.textContent = "Escolha a congregação e informe o nome."; return; }
  const res = await fetchProtegido(`${API_BASE}/dizimistas`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ congregacaoId, nome })
  });
  const data = await res.json();
  avisarResultado(data);
  msg.textContent = data.mensagem;
  if (data.sucesso) {
    document.getElementById("financeiroNovoDizimistaNome").value = "";
    carregarOpcoesDizimistas();
  }
}

function alternarComprovanteLancamento() {
  const forma = document.getElementById("financeiroLancForma").value;
  document.getElementById("cxComprovanteLancamento").style.display = forma === "PIX" || forma === "MISTO" ? "block" : "none";
  document.getElementById("cxValorPixLancamento").style.display = forma === "MISTO" ? "block" : "none";
}

function arquivoParaBase64(arquivo) {
  return new Promise((resolve, reject) => {
    const leitor = new FileReader();
    leitor.onload = () => resolve(String(leitor.result).split(",")[1]);
    leitor.onerror = reject;
    leitor.readAsDataURL(arquivo);
  });
}

// "Outra entrada" (bazar, campanha, evento) é dinheiro institucional, não
// de uma pessoa — troca dizimista/nome avulso por uma descrição livre.
async function salvarLancamentoTesourariaAcao() {
  const msg = document.getElementById("resultadoLancamentoTesouraria");
  const congregacaoId = document.getElementById("financeiroLancCongregacao").value;
  const mesReferencia = document.getElementById("financeiroLancMes").value;
  const dizimistaId = document.getElementById("financeiroLancDizimista").value;
  const nomeAvulso = document.getElementById("financeiroLancNomeAvulso").value.trim();
  const tipo = document.getElementById("financeiroLancTipo").value;
  const descricao = document.getElementById("financeiroLancDescricao").value.trim();
  const valor = document.getElementById("financeiroLancValor").value;
  const formaPagamento = document.getElementById("financeiroLancForma").value;
  const valorPix = document.getElementById("financeiroLancValorPix").value;
  const arquivoComprovante = document.getElementById("financeiroLancComprovante").files[0];

  if (!congregacaoId || !mesReferencia || !valor) {
    msg.textContent = "Preencha congregação, mês e valor.";
    return;
  }
  if (!dizimistaId && !nomeAvulso && !descricao) {
    msg.textContent = "Informe o dizimista, um nome avulso, ou ao menos uma descrição da origem.";
    return;
  }
  if (formaPagamento === "MISTO" && !valorPix) {
    msg.textContent = "Em pagamento misto, informe o valor pago via PIX.";
    return;
  }

  const body = { congregacaoId, mesReferencia, tipo, valor, formaPagamento };
  if (dizimistaId) body.dizimistaId = dizimistaId; else if (nomeAvulso) body.nomeAvulso = nomeAvulso;
  if (descricao) body.descricao = descricao;
  if (formaPagamento === "MISTO") body.valorPix = valorPix;
  if (arquivoComprovante) {
    body.comprovanteBase64 = await arquivoParaBase64(arquivoComprovante);
    body.mimeType = arquivoComprovante.type;
  }

  const res = await fetchProtegido(`${API_BASE}/tesouraria-lancamentos`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await res.json();
  avisarResultado(data);
  msg.textContent = data.mensagem;
  if (data.sucesso) {
    document.getElementById("financeiroLancNomeAvulso").value = "";
    document.getElementById("financeiroLancDescricao").value = "";
    document.getElementById("financeiroLancValor").value = "";
    document.getElementById("financeiroLancValorPix").value = "";
    document.getElementById("financeiroLancComprovante").value = "";
    carregarLancamentosTesouraria();
  }
}

// Prefere o nome já resolvido pelo backend (categoriaNome, quando o
// endpoint faz o LEFT JOIN); senão busca no cache de categorias carregado
// nesta sessão do painel financeiro.
function rotuloTipoLancamento(tipoOuLancamento) {
  if (typeof tipoOuLancamento === "object" && tipoOuLancamento.categoriaNome) return tipoOuLancamento.categoriaNome;
  const tipo = typeof tipoOuLancamento === "object" ? tipoOuLancamento.tipo : tipoOuLancamento;
  return nomeCategoriaEntrada(tipo);
}

async function carregarLancamentosTesouraria() {
  const congregacaoId = document.getElementById("financeiroLancCongregacao").value;
  const mesReferencia = document.getElementById("financeiroLancMes").value;
  const container = document.getElementById("resultadoLancamentosTesouraria");
  if (!congregacaoId || !mesReferencia) { container.innerHTML = ""; return; }
  const res = await fetchProtegido(`${API_BASE}/tesouraria-lancamentos?congregacaoId=${congregacaoId}&mesReferencia=${mesReferencia}`);
  const lancamentos = await jsonDaTela(res, container, "lista");
  if (lancamentos === null) return;
  if (!Array.isArray(lancamentos) || lancamentos.length === 0) {
    container.innerHTML = "<p class='subtitle'>Nenhum lançamento neste mês ainda.</p>";
    return;
  }
  let html = `<table class="tabela-frequencia"><thead><tr><th></th><th>Termo</th><th>Nome/Descrição</th><th>Categoria</th><th>Valor</th><th>Forma</th><th>Situação</th><th>Contabilização</th><th></th></tr></thead><tbody>`;
  lancamentos.forEach(l => {
    const formaTexto = l.formaPagamento === "MISTO"
      ? `Misto (PIX R$ ${Number(l.valorPix).toFixed(2)} + dinheiro R$ ${(Number(l.valor) - Number(l.valorPix)).toFixed(2)})`
      : l.formaPagamento;
    const comprovanteTag = l.comprovanteUrl
      ? ` <a href="${urlSegura(l.comprovanteUrl)}" target="_blank" rel="noopener">📎</a>`
      : (l.conciliacaoId ? ` <span class="badge-status badge-ativo">conciliado em lote</span>`
        : (l.comprovantePendente ? ` <span class="badge-status badge-licenca">⚠️ comprovante pendente</span>` : ""));
    // v4.3 — autolançamento do dizimista aguardando confirmação do
    // Tesoureiro nunca tem Termo nº ainda (só nasce na confirmação).
    let statusTag;
    if (l.status === "CANCELADO") {
      statusTag = `<span class="badge-status badge-desligado">CANCELADO</span><br /><small>${escaparHtmlEbd(l.motivoCancelamento) || ""}</small>`;
    } else if (l.origem === "AUTOLANCAMENTO" && l.statusConfirmacao === "PENDENTE") {
      statusTag = `<span class="badge-status badge-pendente">Autolançamento — aguardando confirmação</span>`;
    } else if (l.origem === "AUTOLANCAMENTO" && l.statusConfirmacao === "REJEITADO") {
      statusTag = `<span class="badge-status badge-desligado">Autolançamento rejeitado</span><br /><small>${escaparHtmlEbd(l.motivoRejeicaoConfirmacao) || ""}</small>`;
    } else if (l.origem === "AUTOLANCAMENTO") {
      statusTag = `<span class="badge-status badge-ativo">Confirmado (comprovante do dizimista)</span>`;
    } else {
      statusTag = `<span class="badge-status badge-ativo">Ativo</span>`;
    }
    // v4.1.2 — "contabilizado" (dentro de um Fechamento) vs "pendente" (mês
    // ainda aberto) era invisível antes; pedido explícito pra deixar claro.
    const contabilizacaoTag = l.contabilizado
      ? `<span class="badge-status badge-ativo">Contabilizado</span>`
      : `<span class="badge-status badge-licenca">Pendente de fechamento</span>`;
    const podeConciliar = !l.fechamentoId && l.status === "ATIVO" && l.comprovantePendente && ["PIX", "MISTO"].includes(l.formaPagamento);
    const valorPixParcela = l.formaPagamento === "MISTO" ? l.valorPix : l.valor;
    const pendenteConfirmacao = l.origem === "AUTOLANCAMENTO" && l.statusConfirmacao === "PENDENTE";
    const confirmadoAutolancamento = l.origem === "AUTOLANCAMENTO" && l.statusConfirmacao === "CONFIRMADO";
    let acoes = "";
    if (pendenteConfirmacao && l.status === "ATIVO") {
      acoes = `<button class="btn-link" data-on-click="confirmarAutolancamentoAcao" data-args-click="${argsAttr(l.lancamentoId, "CONFIRMAR")}">✅ Confirmar</button>
        <button class="btn-link btn-link-perigo" data-on-click="confirmarAutolancamentoAcao" data-args-click="${argsAttr(l.lancamentoId, "REJEITAR")}">Rejeitar</button>`;
    } else if (!l.fechamentoId && l.status === "ATIVO" && !confirmadoAutolancamento) {
      acoes = `<button class="btn-link btn-link-perigo" data-on-click="cancelarLancamentoTesourariaAcao" data-args-click="${argsAttr(l.lancamentoId, String(l.termoNumero ?? ""))}">Cancelar</button>`;
      if (l.comprovantePendente) {
        acoes += ` <button class="btn-link" data-on-click="anexarComprovanteTesourariaAcao" data-args-click="${argsAttr(l.lancamentoId)}">Anexar comprovante</button>`;
      }
    }
    html += `<tr>
      <td>${podeConciliar ? `<input type="checkbox" class="chk-conciliar-pix" value="${l.lancamentoId}" data-valor="${escaparHtmlEbd(valorPixParcela)}" data-on-change="recalcularTotalConciliacaoPix" />` : ""}</td>
      <td>${escaparHtmlEbd(l.termoNumero) || "—"}</td>
      <td>${escaparHtmlEbd(l.dizimistaNome) || escaparHtmlEbd(l.nomeAvulso) || escaparHtmlEbd(l.descricao)}</td>
      <td>${escaparHtmlEbd(rotuloTipoLancamento(l))}</td>
      <td>R$ ${Number(l.valor).toFixed(2)}</td>
      <td>${escaparHtmlEbd(formaTexto)}${comprovanteTag}</td>
      <td>${statusTag}</td>
      <td>${contabilizacaoTag}</td>
      <td class="acoes-inline">${acoes}</td>
    </tr>`;
  });
  html += "</tbody></table>";
  container.innerHTML = html;
}

// Soma automática do valor total sugerido no extrato, conforme os PIX
// selecionados pra conciliação em lote — evita ter que somar de cabeça.
function recalcularTotalConciliacaoPix() {
  const marcados = document.querySelectorAll(".chk-conciliar-pix:checked");
  const total = Array.from(marcados).reduce((soma, chk) => soma + Number(chk.dataset.valor), 0);
  const campo = document.getElementById("financeiroConciliacaoValorTotal");
  if (marcados.length > 0) campo.value = total.toFixed(2);
}

async function conciliarPixSelecionadosAcao() {
  const congregacaoId = document.getElementById("financeiroLancCongregacao").value;
  const mesReferencia = document.getElementById("financeiroLancMes").value;
  const msg = document.getElementById("resultadoConciliacaoPix");
  const marcados = Array.from(document.querySelectorAll(".chk-conciliar-pix:checked")).map(chk => Number(chk.value));
  const valorTotal = document.getElementById("financeiroConciliacaoValorTotal").value;
  const arquivo = document.getElementById("financeiroConciliacaoComprovante").files[0];

  if (marcados.length === 0) { msg.textContent = "Marque ao menos um lançamento pendente."; return; }
  if (!valorTotal || !arquivo) { msg.textContent = "Informe o valor total e anexe o extrato/comprovante."; return; }

  const body = {
    congregacaoId, mesReferencia, lancamentoIds: marcados, valorTotal,
    comprovanteBase64: await arquivoParaBase64(arquivo), mimeType: arquivo.type
  };
  const res = await fetchProtegido(`${API_BASE}/tesouraria-conciliacao`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body)
  });
  const data = await res.json();
  avisarResultado(data);
  msg.textContent = data.mensagem;
  if (data.sucesso) {
    document.getElementById("financeiroConciliacaoValorTotal").value = "";
    document.getElementById("financeiroConciliacaoComprovante").value = "";
    carregarLancamentosTesouraria();
  }
}

// ---- DIZIMISTAS DO MÊS (v4.1.2) — quem já contribuiu e quem ainda não ----
async function carregarDizimistasMes() {
  const congregacaoId = document.getElementById("financeiroDizCongregacao").value;
  const mesReferencia = document.getElementById("financeiroDizMes").value;
  const container = document.getElementById("resultadoDizimistasMes");
  if (!congregacaoId || !mesReferencia) { container.innerHTML = ""; return; }

  const res = await fetchProtegido(`${API_BASE}/tesouraria-dizimistas-mes?congregacaoId=${congregacaoId}&mesReferencia=${mesReferencia}`);
  const data = await jsonDaTela(res, container, "objeto");
  if (data === null) return;
  if (data.sucesso === false) { container.innerHTML = `<p class="subtitle">${escaparHtmlEbd(data.mensagem)}</p>`; return; }

  let html = `<p class="subtitle"><strong>${escaparHtmlEbd(data.totalContribuiram)} de ${escaparHtmlEbd(data.totalDizimistas)}</strong> dizimistas cadastrados já contribuíram este mês.</p>
    <table class="tabela-frequencia"><thead><tr><th>Nome</th><th>Contribuiu?</th><th>Total no mês</th></tr></thead><tbody>`;
  data.dizimistas.forEach(d => {
    html += `<tr>
      <td>${escaparHtmlEbd(d.nome)}</td>
      <td>${d.contribuiu ? "<span class='badge-status badge-ativo'>Sim</span>" : "<span class='badge-status badge-inativo'>Ainda não</span>"}</td>
      <td>R$ ${Number(d.totalContribuido).toFixed(2)}</td>
    </tr>`;
  });
  html += "</tbody></table>";

  if (data.avulsos.length > 0) {
    html += `<h4 style="margin:16px 0 10px; color: var(--cor-primaria);">Contribuições avulsas (sem cadastro de dizimista)</h4>
      <table class="tabela-frequencia"><thead><tr><th>Nome</th><th>Total no mês</th></tr></thead><tbody>`;
    data.avulsos.forEach(a => {
      html += `<tr><td>${escaparHtmlEbd(a.nome)}</td><td>R$ ${Number(a.totalContribuido).toFixed(2)}</td></tr>`;
    });
    html += "</tbody></table>";
  }
  container.innerHTML = html;
}

async function cancelarLancamentoTesourariaAcao(lancamentoId, termoNumero) {
  const motivo = await pedirTexto(`Motivo do cancelamento do Termo nº ${termoNumero}`, "Ex: valor digitado errado, folha arrancada do bloco");
  if (motivo === null) return;
  if (!motivo.trim()) { mostrarToast("Informe o motivo do cancelamento.", "erro"); return; }
  const res = await fetchProtegido(`${API_BASE}/tesouraria-lancamentos/${lancamentoId}`, {
    method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ motivo })
  });
  const data = await res.json();
  avisarResultado(data);
  if (data.sucesso) carregarLancamentosTesouraria();
}

// v4.3 — o Tesoureiro Local confirma (viu o dinheiro/PIX cair) ou rejeita
// um autolançamento do dizimista. O Termo nº só é gerado na confirmação.
async function confirmarAutolancamentoAcao(lancamentoId, acaoConfirmacao) {
  let motivo;
  if (acaoConfirmacao === "REJEITAR") {
    motivo = await pedirTexto("Motivo da rejeição", "Ex: valor não confere com o recebido");
    if (motivo === null) return;
    if (!motivo.trim()) { mostrarToast("Informe o motivo da rejeição.", "erro"); return; }
  }
  const res = await fetchProtegido(`${API_BASE}/tesouraria-autolancamento-confirmar/${lancamentoId}`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ acao: acaoConfirmacao, motivo })
  });
  const data = await res.json();
  avisarResultado(data);
  if (data.sucesso) carregarLancamentosTesouraria();
}

// v4.1.4 — só a Tesouraria Geral aprova/rejeita "Outra entrada" (mesmo
// princípio de RegistrarRepasseTesouraria: quem confere nunca é quem lançou).
async function anexarComprovanteTesourariaAcao(lancamentoId) {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = "image/jpeg,image/png,application/pdf";
  input.onchange = async () => {
    const arquivo = input.files[0];
    if (!arquivo) return;
    const body = { comprovanteBase64: await arquivoParaBase64(arquivo), mimeType: arquivo.type };
    const res = await fetchProtegido(`${API_BASE}/tesouraria-lancamentos/${lancamentoId}`, {
      method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body)
    });
    const data = await res.json();
    avisarResultado(data);
    if (data.sucesso) carregarLancamentosTesouraria();
  };
  input.click();
}

async function carregarResumoFechamento() {
  const congregacaoId = document.getElementById("financeiroFechCongregacao").value;
  const mesReferencia = document.getElementById("financeiroFechMes").value;
  const container = document.getElementById("resultadoResumoFechamento");
  if (!congregacaoId || !mesReferencia) { container.innerHTML = ""; return; }

  const res = await fetchProtegido(`${API_BASE}/tesouraria-relatorio?congregacaoId=${congregacaoId}&mesReferencia=${mesReferencia}`);
  const data = await jsonDaTela(res, container, "objeto");
  if (data === null) return;
  if (!data.sucesso) { container.innerHTML = `<p class="subtitle">${escaparHtmlEbd(data.mensagem) || "Erro ao carregar."}</p>`; return; }

  const f = data.fechamento;
  const linhaValor = (rotulo, valor) => `<tr><td>${escaparHtmlEbd(rotulo)}</td><td>R$ ${Number(valor).toFixed(2)}</td></tr>`;

  if (!f) {
    container.innerHTML = `
      <p class="subtitle">Mês ainda aberto — ${data.lancamentos.length} lançamento(s) registrado(s).</p>
      <button class="btn-confirmar" style="width:auto;" data-on-click="fecharMesTesourariaAcao" data-args-click="${argsAttr(Number(congregacaoId), String(mesReferencia ?? ""))}">🔒 Fechar mês</button>
      <p id="resultadoFecharMes" class="subtitle"></p>`;
    return;
  }

  let html = `<table class="tabela-frequencia">
    <tbody>
      ${linhaValor("Total Recebido", f.totalRecebido)}
      ${linhaValor("Aluguel", f.valorAluguel)}
      ${linhaValor("Lote", f.valorLote)}
      ${linhaValor("Total Final", f.totalFinal)}
      ${linhaValor(`Centro de Custo Local (${f.percentualRetencaoLocal}%)`, f.valorRetidoLocal)}
      ${linhaValor(`Centro de Custo Geral (${(100 - f.percentualRetencaoLocal).toFixed(2)}%)`, f.valorRepasseGeral)}
    </tbody>
  </table>
  <!-- v4.1.3 — hoje existe uma única conta bancária pra toda a
       denominação: não há "envio" físico da congregação pra Geral, os 40%
       ficam retidos como saldo virtual (Centro de Custo Local) até a
       Tesouraria Geral conferir o fechamento e liberar. -->
  <p class="subtitle">Situação: <span class="badge-status ${f.status === "REPASSADO" ? "badge-ativo" : "badge-licenca"}">${f.status === "REPASSADO" ? "Saldo liberado pela Tesouraria Geral" : "Aguardando liberação da Tesouraria Geral"}</span>${f.dataRepasse ? ` — liberado em ${new Date(f.dataRepasse).toLocaleDateString("pt-BR")}${f.formaRepasse ? ` via ${escaparHtmlEbd(f.formaRepasse)}` : ""}` : ""}</p>`;

  if (f.status !== "REPASSADO") {
    if (authGeral) {
      html += `
        <hr />
        <h4 style="margin:0 0 10px; color: var(--cor-primaria);">✅ Tesouraria Geral: conferir e liberar</h4>
        <div class="input-group">
          <label>Forma do repasse (se já houver movimentação real registrada):</label>
          <select id="financeiroFormaRepasse">
            <option value="PIX">PIX</option>
            <option value="DEPOSITO">Depósito bancário</option>
            <option value="DINHEIRO">Dinheiro (entregue em mãos)</option>
          </select>
        </div>
        <div class="input-group">
          <label>Comprovante (opcional):</label>
          <input type="file" id="financeiroComprovanteRepasse" accept="image/jpeg,image/png,application/pdf" />
        </div>
        ${authGeral ? `<button class="btn-confirmar" style="width:auto;" data-on-click="registrarRepasseTesourariaAcao" data-args-click="${argsAttr(Number(congregacaoId), String(mesReferencia ?? ""))}">✅ Conferir e liberar saldo local</button>` : ""}
        <p id="resultadoRepasse" class="subtitle"></p>`;
    } else {
      html += `<p class="subtitle">Só a Tesouraria Geral pode conferir e liberar este saldo.</p>`;
    }
  }
  container.innerHTML = html;
}

async function fecharMesTesourariaAcao(congregacaoId, mesReferencia) {
  if (!(await confirmarAcao("Fechar este mês? Não será mais possível lançar entradas nele.", "Fechar mês"))) return;
  const res = await fetchProtegido(`${API_BASE}/tesouraria-fechamento`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ congregacaoId, mesReferencia })
  });
  const data = await res.json();
  avisarResultado(data);
  if (data.sucesso) carregarResumoFechamento();
  else { const el = document.getElementById("resultadoFecharMes"); if (el) el.textContent = data.mensagem; }
}

async function registrarRepasseTesourariaAcao(congregacaoId, mesReferencia) {
  // Precisa buscar o fechamentoId de novo — RelatorioTesouraria não devolve
  // o id (só os dados do fechamento), então lê direto do consolidado.
  const resFechamentos = await fetchProtegido(`${API_BASE}/tesouraria-fechamentos?mesReferencia=${mesReferencia}`);
  const dataFechamentos = await resFechamentos.json();
  const alvo = (dataFechamentos.fechamentos || []).find(f => f.congregacaoId === Number(congregacaoId));
  if (!alvo) { mostrarToast("Fechamento não encontrado.", "erro"); return; }

  const arquivo = document.getElementById("financeiroComprovanteRepasse").files[0];
  const body = { formaRepasse: document.getElementById("financeiroFormaRepasse").value };
  if (arquivo) { body.comprovanteBase64 = await arquivoParaBase64(arquivo); body.mimeType = arquivo.type; }

  const res = await fetchProtegido(`${API_BASE}/tesouraria-repasse/${alvo.fechamentoId}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await res.json();
  avisarResultado(data);
  if (data.sucesso) carregarResumoFechamento();
}

async function gerarRelatorioTesourariaAcao(modo) {
  const congregacaoId = document.getElementById("financeiroRelCongregacao").value;
  const mesReferencia = document.getElementById("financeiroRelMes").value;
  const container = document.getElementById("resultadoRelatorioTesouraria");
  if (!congregacaoId || !mesReferencia) { mostrarToast("Escolha a congregação e o mês.", "erro"); return; }

  const res = await fetchProtegido(`${API_BASE}/tesouraria-relatorio?congregacaoId=${congregacaoId}&mesReferencia=${mesReferencia}&modo=${modo}`);
  const data = await jsonDaTela(res, container, "objeto");
  if (data === null) return;
  if (!data.sucesso) { container.innerHTML = `<p class="subtitle">${escaparHtmlEbd(data.mensagem) || "Erro ao gerar relatório."}</p>`; return; }

  let html = `<h4>${escaparHtmlEbd(data.congregacaoNome)} — ${escaparHtmlEbd(data.mesReferencia)} (${modo === "mural" ? "versão mural, sem valores" : "versão completa"})</h4>
    <table class="tabela-frequencia"><thead><tr><th>Termo</th><th>Nome</th><th>Tipo</th>${modo === "mural" ? "" : "<th>Valor</th><th>Forma</th>"}</tr></thead><tbody>`;
  data.lancamentos.forEach(l => {
    // Cancelado (folha arrancada do bloco físico) nunca some da numeração —
    // continua aparecendo no relatório, marcado como tal, com o motivo.
    if (l.status === "CANCELADO") {
      html += `<tr style="opacity:.6;"><td>${escaparHtmlEbd(l.termoNumero)}</td><td colspan="${modo === "mural" ? 2 : 4}"><em>CANCELADO — ${escaparHtmlEbd(l.motivoCancelamento) || "sem motivo registrado"}</em></td></tr>`;
      return;
    }
    html += `<tr><td>${escaparHtmlEbd(l.termoNumero)}</td><td>${escaparHtmlEbd(l.nome)}</td><td>${escaparHtmlEbd(rotuloTipoLancamento(l.tipo))}</td>${modo === "mural" ? "" : `<td>R$ ${Number(l.valor).toFixed(2)}</td><td>${escaparHtmlEbd(l.formaPagamento)}</td>`}</tr>`;
  });
  html += "</tbody></table>";
  if (data.fechamento) {
    const f = data.fechamento;
    html += `<p class="subtitle">Total Recebido: R$ ${Number(f.totalRecebido).toFixed(2)} · Total Final: R$ ${Number(f.totalFinal).toFixed(2)} ·
      Repasse Geral: R$ ${Number(f.valorRepasseGeral).toFixed(2)}</p>`;
  }
  container.innerHTML = html;
}

async function carregarParametrosTesouraria() {
  const congregacaoId = document.getElementById("financeiroParamCongregacao").value;
  if (!congregacaoId) return;
  const res = await fetchProtegido(`${API_BASE}/tesouraria-parametros/${congregacaoId}`);
  const data = await res.json();
  if (data.sucesso === false) return;
  document.getElementById("financeiroParamAluguel").value = data.valorAluguelMensal || "";
  document.getElementById("financeiroParamLote").value = data.valorLoteMensal || "";
  document.getElementById("financeiroParamPercentual").value = data.percentualRetencaoLocal;
}

async function salvarParametrosTesourariaAcao() {
  const congregacaoId = document.getElementById("financeiroParamCongregacao").value;
  const msg = document.getElementById("resultadoParametrosTesouraria");
  if (!congregacaoId) { msg.textContent = "Escolha a congregação."; return; }
  const body = {
    valorAluguelMensal: document.getElementById("financeiroParamAluguel").value || null,
    valorLoteMensal: document.getElementById("financeiroParamLote").value || null,
    percentualRetencaoLocal: document.getElementById("financeiroParamPercentual").value
  };
  const res = await fetchProtegido(`${API_BASE}/tesouraria-parametros/${congregacaoId}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await res.json();
  avisarResultado(data);
  msg.textContent = data.mensagem;
}

async function carregarConsolidadoTesouraria() {
  const mesReferencia = document.getElementById("financeiroConsolidadoMes").value;
  const container = document.getElementById("resultadoConsolidadoTesouraria");
  const qs = mesReferencia ? `?mesReferencia=${mesReferencia}` : "";
  const res = await fetchProtegido(`${API_BASE}/tesouraria-fechamentos${qs}`);
  const data = await jsonDaTela(res, container, "objeto");
  if (data === null) return;
  const fechamentos = data.fechamentos || [];

  if (fechamentos.length === 0) {
    container.innerHTML = "<p class='subtitle'>Nenhum fechamento no seu escopo para este período.</p>";
    return;
  }
  // v4.1.3 — Centro de Custo: conta única pra toda a denominação, então
  // "liberado" (Status=REPASSADO) é o que a Geral já conferiu e cada
  // congregação já pode gastar; "pendente" ainda está no caixa único
  // esperando conferência.
  let html = `<p class="subtitle"><strong>Total Recebido (escopo):</strong> R$ ${data.consolidado.totalRecebido.toFixed(2)} ·
    <strong>Centro de Custo Local (total):</strong> R$ ${data.consolidado.valorRetidoLocal.toFixed(2)} ·
    <strong>Centro de Custo Geral (total):</strong> R$ ${data.consolidado.valorRepasseGeral.toFixed(2)}</p>`;

  if (data.centroCustoGeral) {
    html += `<div class="cartao-perfil">
      <p class="linha-perfil"><strong>🏛️ Centro de Custo Geral</strong></p>
      <p class="linha-perfil">Liberado (disponível): R$ ${data.centroCustoGeral.liberado.toFixed(2)}</p>
      <p class="linha-perfil">Pendente de conferência: R$ ${data.centroCustoGeral.pendente.toFixed(2)}</p>
    </div>`;
  }
  if (data.porCongregacao && data.porCongregacao.length > 0) {
    html += `<h4 style="margin:16px 0 10px; color: var(--cor-primaria);">📍 Centro de Custo Local (por congregação)</h4>
      <table class="tabela-frequencia"><thead><tr><th>Congregação</th><th>Saldo Liberado</th><th>Pendente de Liberação</th></tr></thead><tbody>`;
    data.porCongregacao.forEach(c => {
      html += `<tr><td>${escaparHtmlEbd(c.congregacaoNome)}</td><td>R$ ${c.saldoLiberado.toFixed(2)}</td><td>R$ ${c.saldoPendente.toFixed(2)}</td></tr>`;
    });
    html += "</tbody></table>";
  }

  html += `<h4 style="margin:16px 0 10px; color: var(--cor-primaria);">Fechamentos do período</h4>
    <table class="tabela-frequencia"><thead><tr><th>Congregação</th><th>Mês</th><th>Total Final</th><th>Centro de Custo Geral</th><th>Situação</th></tr></thead><tbody>`;
  fechamentos.forEach(f => {
    html += `<tr>
      <td>${escaparHtmlEbd(f.congregacaoNome)}</td><td>${escaparHtmlEbd(f.mesReferencia)}</td>
      <td>R$ ${Number(f.totalFinal).toFixed(2)}</td><td>R$ ${Number(f.valorRepasseGeral).toFixed(2)}</td>
      <td><span class="badge-status ${f.status === "REPASSADO" ? "badge-ativo" : "badge-licenca"}">${f.status === "REPASSADO" ? "Liberado" : "Pendente"}</span></td>
    </tr>`;
  });
  html += "</tbody></table>";
  container.innerHTML = html;
}

registrarAcoes({
  abrirInventarioAcao, abrirParecerViabilidadeAcao, acaoObra, alternarCampoCampanhaSaida, alternarCamposDemonstracao, alternarComprovanteLancamento,
  alternarCongregacaoFluxoCaixa, alternarCotacoesSaida, alternarEdicaoValorReferenciaCotacoes, alternarFormDadosBancariosInstituicao,
  alternarFormNovaCampanha, alternarFormNovaContaReceber, alternarFormNovaMetaPdq, alternarFormNovaSaida, alternarFormNovoFornecedor,
  alternarFormNovoFundoFixo, alternarFormNovoOrcamento, alternarFormNovoPlanoPdq, alternarFormNovoProjetoPdq, alternarFormNovoSorteio,
  anexarComprovanteTesourariaAcao, aoTrocarCongregacaoLancamentos, aprovarSaidaAcao, atualizarStatusCampanhaAcao, atualizarStatusMetaPdqAcao,
  atualizarStatusPlanoPdqAcao, atualizarStatusProjetoPdqAcao, cancelarCessaoTemploAcao, cancelarContaReceberAcao, cancelarLancamentoTesourariaAcao,
  cancelarSaidaAcao, carregarConsolidadoTesouraria, carregarContasReceber, carregarDizimistasMes, carregarDossieFiscalAcao,
  carregarFluxoCaixaProjetadoAcao, carregarImunidadeTributariaAcao, carregarInformeRendimentosAcao, carregarLancamentosTesouraria,
  carregarMedidorEcdAcao, carregarNotasExplicativasAcao, carregarOpcoesDizimistasReceber, carregarParametrosTesouraria, carregarResumoFechamento,
  carregarSaidas, carregarSituacaoTesouroAcao, conciliarPixSelecionadosAcao, concluirManutencaoVeiculoAcao, confirmarAutolancamentoAcao,
  confirmarContaReceberAcao, confirmarDadosBancariosFornecedorAcao, confirmarRepasseAcao, corrigirTodosValoresAcao, criarCampanhaAcao,
  criarFundoFixoAcao, criarMetaPdqAcao, criarOrcamentoAcao, criarPlanoPdqAcao, criarProjetoPdqAcao, criarSorteioAcao, emitirParecerViabilidadeAcao,
  encerrarOrcamentoAcao, fecharMesTesourariaAcao, fecharRateioGeralAcao, gerarDemonstracaoAcao, gerarFolhaPrebendaAcao, gerarRelatorioTesourariaAcao,
  gerarRemessaBancariaAcao, homologarRemanejamentoPdqAcao, importarExtratoAcao, marcarSorteioRealizadoAcao, mostrarSubAbaFinanceiro, pagarSaidaAcao,
  processarRetornoRemessaAcao, proporAlienacaoAcao, reativarFundoPdqAcao, recalcularTotalConciliacaoPix, registrarDevolucaoChaveAcao,
  registrarGanhadorAcao, registrarManutencaoVeiculoAcao, registrarMovimentoFundoFixoAcao, registrarObraAcao, registrarObraMarcoAcao,
  registrarReceitaAcessoriaAcao, registrarRepasseInstitucionalAcao, registrarRepasseTesourariaAcao, registrarRetiradaChaveAcao,
  registrarRiscoVinculoAcao, registrarTermoConducaoAcao, rejeitarRemanejamentoPdqAcao, rejeitarSaidaAcao, resolverDivergenciaAcao,
  resolverRiscoVinculoAcao, salvarAplicacaoAcao, salvarApoliceAcao, salvarAtoDesignacaoAcao, salvarAuxilioCustoAcao, salvarBemPatrimonialAcao,
  salvarCessaoTemploAcao, salvarContaReceberAcao, salvarDadosBancariosInstituicaoAcao, salvarDizimistaAcao, salvarDocumentoBemAcao,
  salvarFornecedorAcao, salvarFrotaAcao, salvarImovelAcao, salvarLancamentoTesourariaAcao, salvarNotasExplicativasAcao, salvarObrigacaoFiscalAcao,
  salvarOcupacaoCasaPastoralAcao, salvarParametrosTesourariaAcao, salvarPrebendadoAcao, salvarRetencaoAcao, salvarValorMonetarioAcao,
  solicitarRemanejamentoPdqAcao, solicitarSaidaAcao, suspenderFundoPdqAcao, tratarDivergenciaRemessaAcao, verDetalheCampanhaAcao,
  verDetalheConciliacaoAcao, verDetalheContaReceberAcao, verDetalheFundoFixoAcao, verDetalheOrcamentoAcao, verDetalhePlanoPdqAcao,
  verDetalheRateioGeralAcao, verDetalheRemessaAcao, verDetalheSaidaAcao, verDetalheSorteioAcao, verRelatorioProgressoPdqAcao
});
