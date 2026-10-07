// app/modulos/catalogos-estrutura.js — módulo extraído do script.js (vD.2, 2026-10-07).
// Script clássico, carregado pelo index.html DEPOIS do script.js e do eventos.js: compartilha o escopo
// global com eles (as funções e constantes abaixo continuam acessíveis pelo nome, como antes). As ações
// que o HTML pede deste módulo são registradas aqui mesmo, no fim do arquivo (registrarAcoes mescla).

// ---- Catálogos & Estrutura (CRUD genérico + linkagem hierárquica + paginação) ----
const CATALOGOS_CFG = {
  congregacoes: { titulo: "Congregações (Nível 1)", idField: "congregacaoId", campos: [["nome", "Nome da Congregação"]], pai: { campo: "areaId", rotulo: "Área", origem: "areas" } },
  areas: { titulo: "Áreas (Nível 2)", idField: "areaId", campos: [["nome", "Nome da Área"]], pai: { campo: "regiaoId", rotulo: "Região", origem: "regioes" } },
  regioes: { titulo: "Regiões (Nível 3)", idField: "regiaoId", campos: [["nome", "Nome da Região"]], pai: { campo: "quadranteId", rotulo: "Quadrante", origem: "quadrantes" } },
  quadrantes: { titulo: "Quadrantes (Nível 4)", idField: "quadranteId", campos: [["nome", "Nome do Quadrante"]], pai: { campo: "distritoId", rotulo: "Distrito", origem: "distritos" } },
  distritos: { titulo: "Distritos (Nível 5)", idField: "distritoId", campos: [["nome", "Nome do Distrito"]] },
  extensoes: { titulo: "Extensões da Tenda (Nível 0)", idField: "extensaoId", campos: [["nome", "Nome da Extensão"]], pai: { campo: "congregacaoMaeId", rotulo: "Congregação-Mãe", origem: "congregacoes" } },
  situacoes: { titulo: "Situações de Membro", idField: "situacaoId", campos: [["sigla", "Sigla"], ["nome", "Nome"]] },
  statuses: { titulo: "Status do Membro", idField: "statusId", campos: [["sigla", "Sigla"], ["nome", "Nome"]] },
  departamentos: { titulo: "Departamentos", idField: "departamentoId", campos: [["sigla", "Sigla"], ["nome", "Nome"], ["numero", "Número"], ["tipo", "Tipo", [["DEPARTAMENTO", "Departamento"], ["SECRETARIA_ADJUNTA", "Secretaria Adjunta"]]]] },
  tiposConsagracao: {
    titulo: "Tipos de Proposta (Consagrações)", idField: "tipoConsagracaoId",
    campos: [
      ["nome", "Nome do Tipo"],
      ["cargoMinisterialResultante", "Cargo Ministerial resultante (opcional)", [
        ["MEMBRO", "Membro"], ["AUXILIAR", "Auxiliar"], ["MISSIONARIO", "Missionário(a)"],
        ["DIACONO", "Diácono"], ["PRESBITERO", "Presbítero"], ["EVANGELISTA", "Evangelista"], ["PASTOR", "Pastor"]
      ], true]
    ]
  },
  orgaosLocais: { titulo: "Órgãos Locais (JAI/JEA/JUC/CRA/TER/CRAF/CEQ/CAQ/CDE)", idField: "orgaoLocalId", campos: [["sigla", "Sigla (JAI/JEA/JUC/CRA/TER/CRAF/CEQ/CAQ/CDE)"], ["nome", "Nome"], ["nivel", "Nível (1-5)"], ["referenciaId", "Id da Congregação/Área/Região/Quadrante/Distrito"]] },
  cargosMinisteriais: { titulo: "Cargos Ministeriais (escada — Art. 71)", idField: "cargoId", campos: [["sigla", "Sigla"], ["nome", "Nome"], ["ordem", "Ordem na escada"]] },
  prazos: { titulo: "Prazos (Estatuto/Regimento)", idField: "prazoId", campos: [["sigla", "Sigla"], ["nome", "Nome"], ["dias", "Dias"]] },
  tiposVinculoFamiliar: { titulo: "Tipos de Vínculo Familiar", idField: "tipoVinculoId", campos: [["codigo", "Código"], ["rotuloDireto", "Rótulo direto (ex: Pai/Mãe de)"], ["rotuloInverso", "Rótulo inverso (deixe vazio se simétrico)"]] },
  // politicasRetencao removido daqui (vB.8, achado real): esta tela genérica
  // só exige a permissão "pessoas" (padrão de GestaoCatalogos), aberta demais
  // pra editar base legal/retenção — a edição de verdade é
  // GestaoPoliticasRetencao (vB.6), restrita a nível Global.
  // canaisOficiais saiu daqui (v7.3): /api/catalogos/canaisOficiais responde 404; a relação de
  // Canais Oficiais (Estatuto Art. 12) é mantida no módulo "Canais e Comunicação".
  tiposInfracao: {
    titulo: "Infrações Disciplinares (Art. 96-99, 144)", idField: "infracaoId",
    campos: [
      ["codigo", "Código (ex: ART96-I)"], ["nome", "Nome"], ["referenciaRegimento", "Referência (ex: Art. 96, I)"],
      ["gravidade", "Gravidade", [["LEVE", "Leve"], ["MEDIA", "Média"], ["GRAVE", "Grave"], ["GRAVISSIMA", "Gravíssima"]]]
    ]
  },
  tiposPenalidade: {
    titulo: "Penalidades (Art. 95 §2º)", idField: "penalidadeId",
    campos: [["codigo", "Código (ex: ADVERTENCIA)"], ["nome", "Nome"], ["referenciaRegimento", "Referência (ex: Art. 95 §2º, I)"]]
  },
  planoContas: {
    titulo: "Plano de Contas", idField: "contaId",
    campos: [["codigo", "Código (ex: 4.1.1)"], ["nome", "Nome da Conta"],
      ["tipo", "Tipo", [["ATIVO", "Ativo"], ["PASSIVO", "Passivo"], ["PATRIMONIO_LIQUIDO", "Patrimônio Líquido"], ["RECEITA", "Receita"], ["DESPESA", "Despesa"]]]],
    pai: { campo: "contaPaiId", rotulo: "Conta Pai", origem: "planoContas" }
  },
  categoriasEntrada: {
    titulo: "Categorias de Entrada", idField: "categoriaId",
    campos: [["codigo", "Código (ex: DIZIMO)"], ["nome", "Nome"],
      ["tipoFundo", "Tipo de Fundo", [["LIVRE", "Livre"], ["RESTRITO", "Restrito"]]]],
    pai: { campo: "contaContabilId", rotulo: "Conta Contábil", origem: "planoContas" }
  },
  categoriasSaida: {
    titulo: "Categorias de Saída", idField: "categoriaId",
    campos: [["codigo", "Código (ex: MANUTENCAO)"], ["nome", "Nome"],
      ["centroCusto", "Centro de Custo", [["LOCAL", "Local (congregação)"], ["GERAL", "Geral (denominação)"], ["PDQ", "Fundo de Execução Estratégica (PDQ)"]]],
      ["tipoFundo", "Tipo de Fundo", [["LIVRE", "Livre"], ["RESTRITO", "Restrito (exige vincular a uma Campanha)"]]],
      ["classificacaoFuncional", "Classificação Funcional (ITG 2002)", [["ATIVIDADES_FIM", "Atividades-Fim"], ["ADMINISTRATIVA", "Administrativa"]]]],
    pai: { campo: "contaContabilId", rotulo: "Conta Contábil", origem: "planoContas" }
  },
  alcadasAprovacao: {
    titulo: "Alçadas de Aprovação (Saídas)", idField: "alcadaId",
    campos: [["valorMinimo", "Valor mínimo da faixa (R$)"],
      ["nivelMinimoAprovador", "Nível mínimo do aprovador", [
        ["CONGREGACAO", "Congregação"], ["AREA", "Área"], ["REGIAO", "Região"],
        ["QUADRANTE", "Quadrante"], ["DISTRITO", "Distrito"], ["GLOBAL", "Geral"]
      ]],
      ["quantidadeAprovadores", "Quantidade de aprovadores distintos exigida"]]
  },
  rateioGeralDestinos: {
    titulo: "Destinos do Rateio Geral (malote dos 60%)", idField: "destinoId",
    campos: [["codigo", "Código (ex: CONVENCAO)"], ["nome", "Nome"], ["percentual", "Percentual sobre o total do malote (%)"]]
  }
};
// Ordem = nível (0 a 5) da Governança Escalonada (Regimento Art. 104), de baixo
// pra cima: Extensão da Tenda primeiro, Distrito por último. Órgãos Locais
// (JAI/JEA/CRA/TER/CEQ/Distrito) saiu daqui — é órgão, mora na aba Órgãos.
// "congregacoes" saiu do editor genérico (vC.2): tem campos demais
// (endereço/bairro/cidade/mapa) pra caber numa linha de inputs — ganhou tela
// própria, ver montarCongregacoesDetalhe() logo abaixo. O objeto
// CATALOGOS_CFG.congregacoes continua existindo só pra "extensoes" (Nível 0)
// resolver o nome da Congregação-Mãe no dropdown.
const ESTRUTURA_ORDEM = ["extensoes", "areas", "regioes", "quadrantes", "distritos"];
const CATALOGOS_ORDEM = ["statuses", "situacoes", "departamentos", "cargosMinisteriais", "tiposConsagracao", "prazos", "tiposVinculoFamiliar"];
const ORGAOS_LOCAIS_ORDEM = ["orgaosLocais"];
// v4.2 — Plano de Contas primeiro, Categorias de Entrada depois (a segunda
// referencia a primeira via "pai") — moram dentro do Financeiro, não na
// aba genérica de Catálogos (princípio já estabelecido: cada módulo
// configura o que é exclusivo dele).
const CATALOGOS_FINANCEIRO_ORDEM = ["planoContas", "categoriasEntrada", "categoriasSaida", "alcadasAprovacao", "rateioGeralDestinos"];

// vB.8 — ROPA/RIPD: só busca (não edita nada) — mesma permissão
// "protecaodedados" que o backend já exige (GestaoRopa).
async function carregarRopa() {
  const container = document.getElementById("resultadoRopa");
  const res = await fetchProtegido(`${API_BASE}/lgpd/ropa`);
  if (!res.ok) { container.innerHTML = "<p class='subtitle'>Sem permissão pra ver o ROPA.</p>"; return; }
  const registros = await res.json();
  container.innerHTML = registros.map(r => `
    <div style="border:1px solid var(--cor-borda); border-radius:8px; padding:12px; margin-bottom:10px;">
      <strong>${escaparHtmlEbd(r.finalidade)}</strong>
      <p class="subtitle" style="margin:4px 0;">Titulares: ${escaparHtmlEbd(r.titulares)} — Base legal: ${escaparHtmlEbd(r.baseLegal)}</p>
      <p class="subtitle" style="margin:4px 0;">Retenção: ${escaparHtmlEbd(r.retencao)}</p>
      <p class="subtitle" style="margin:4px 0;">Tabelas: ${Object.entries(r.contagens).map(([t, n]) => `${escaparHtmlEbd(t)} (${escaparHtmlEbd(n)})`).join(", ")}</p>
    </div>
  `).join("");
}

async function carregarRipd() {
  const container = document.getElementById("resultadoRipd");
  const res = await fetchProtegido(`${API_BASE}/lgpd/ropa/ripd`);
  if (!res.ok) { container.innerHTML = "<p class='subtitle'>Sem permissão pra ver o RIPD.</p>"; return; }
  const ripds = await res.json();
  container.innerHTML = ripds.map(r => `
    <div style="border:1px solid var(--cor-borda); border-radius:8px; padding:12px; margin-bottom:10px;">
      <strong>${escaparHtmlEbd(r.tratamento)}</strong>
      ${r.riscoIdentificado ? `
        <p class="subtitle" style="margin:4px 0;">Risco: ${escaparHtmlEbd(r.riscoIdentificado)}</p>
        <p class="subtitle" style="margin:4px 0;">Mitigação: ${escaparHtmlEbd(r.medidasMitigacao.join("; "))}</p>
      ` : ""}
      <p class="subtitle" style="margin:4px 0;">Risco residual: ${escaparHtmlEbd(r.riscoResidual)}</p>
    </div>
  `).join("");
}
function montarOrgaosLocais() {
  document.getElementById("orgaosLocaisConteudo").innerHTML = ORGAOS_LOCAIS_ORDEM.map(k => secaoCatalogo(k)).join("");
  ORGAOS_LOCAIS_ORDEM.forEach(k => { carregarOpcoesPai(k); carregarCatalogoLista(k); });
}
function montarCatalogosFinanceiro() {
  document.getElementById("catalogosFinanceiroConteudo").innerHTML = CATALOGOS_FINANCEIRO_ORDEM.map(k => secaoCatalogo(k)).join("");
  CATALOGOS_FINANCEIRO_ORDEM.forEach(k => { carregarOpcoesPai(k); carregarCatalogoLista(k); });
  // Cache local usado pelo formulário de lançamento — precisa recarregar
  // depois de qualquer alteração em Categorias de Entrada.
  _categoriasEntradaCache = null;
}
const CATALOGOS_PAGINA = 15;
let catalogoCache = {};
let catalogoPagina = {};

function montarEstrutura() {
  carregarCongregacoesDetalhe();
  document.getElementById("estruturaConteudo").innerHTML = ESTRUTURA_ORDEM.map(k => secaoCatalogo(k)).join("");
  ESTRUTURA_ORDEM.forEach(k => { carregarOpcoesPai(k); carregarCatalogoLista(k); });
}

function montarCatalogos() {
  document.getElementById("catalogosConteudo").innerHTML = CATALOGOS_ORDEM.map(k => secaoCatalogo(k)).join("");
  CATALOGOS_ORDEM.forEach(k => { carregarOpcoesPai(k); carregarCatalogoLista(k); });
}

// Campo = [id, rotulo] (texto livre) ou [id, rotulo, opcoes] (select, quando o
// valor precisa ser controlado — ex: sigla de outro catálogo, tipo enum fixo).
function secaoCatalogo(key) {
  const c = CATALOGOS_CFG[key];
  const camposHtml = c.campos.map(([id, rotulo, opcoes]) => opcoes
    ? `<select id="cat_${key}_${id}"><option value="">${escaparHtmlEbd(rotulo)}</option>${opcoes.map(([v, r]) => `<option value="${escaparHtmlEbd(v)}">${escaparHtmlEbd(r)}</option>`).join("")}</select>`
    : `<input type="text" id="cat_${key}_${id}" placeholder="${escaparHtmlEbd(rotulo)}" style="min-width:150px;" />`
  ).join("");
  const paiHtml = c.pai ? `<select id="cat_${key}_${escaparHtmlEbd(c.pai.campo)}" style="min-width:180px;"><option value="">Sem ${escaparHtmlEbd(c.pai.rotulo)}</option></select>` : "";
  return `<div class="cartao-perfil" style="margin-bottom:16px;">
    <h4 style="margin:0 0 10px; color: var(--cor-primaria);">${escaparHtmlEbd(c.titulo)}</h4>
    <div class="barra-lista so-geral"><!-- escrever no catálogo é só do geral (GestaoCatalogos); os demais só consultam -->
      ${camposHtml}
      ${paiHtml}
      <button class="btn-confirmar" style="width:auto;margin:0;" data-on-click="salvarCatalogo" data-args-click="${argsAttr(String(key ?? ""))}">➕ Adicionar</button>
    </div>
    <div class="barra-lista">
      <input type="text" id="busca_${key}" placeholder="🔍 Buscar" data-on-input="filtrarCatalogo" data-args-input="${argsAttr(String(key ?? ""))}" style="min-width:150px;" />
      <span id="info_${key}" class="subtitle" style="margin:0;"></span>
    </div>
    <div class="rolagem-tabela"><div id="lista_cat_${key}"></div></div>
    <div class="paginacao" id="pag_${key}"></div>
  </div>`;
}

async function carregarOpcoesPai(key) {
  const c = CATALOGOS_CFG[key];
  if (!c.pai) return;
  const res = await fetchProtegido(`${API_BASE}/catalogos/${c.pai.origem}`);
  const itens = await listaDaApi(res);
  const select = document.getElementById(`cat_${key}_${c.pai.campo}`);
  if (!select) return;
  const idField = CATALOGOS_CFG[c.pai.origem].idField;
  select.innerHTML = `<option value="">Sem ${escaparHtmlEbd(c.pai.rotulo)}</option>` + itens.map(x => `<option value="${escaparHtmlEbd(x[idField])}">${escaparHtmlEbd(x.nome)}</option>`).join("");
}

async function carregarCatalogoLista(key) {
  const c = CATALOGOS_CFG[key];
  const res = await fetchProtegido(`${API_BASE}/catalogos/${key}`);
  catalogoCache[key] = await res.json();
  if (c.pai) {
    const pres = await fetchProtegido(`${API_BASE}/catalogos/${c.pai.origem}`);
    const pitens = await listaDaApi(pres);
    const pidField = CATALOGOS_CFG[c.pai.origem].idField;
    catalogoCache[`_pai_${key}`] = {};
    pitens.forEach(x => catalogoCache[`_pai_${key}`][x[pidField]] = x.nome);
  }
  catalogoPagina[key] = 1;
  renderizarCatalogo(key);
}

function filtrarCatalogo(key) { catalogoPagina[key] = 1; renderizarCatalogo(key); }

function renderizarCatalogo(key) {
  const c = CATALOGOS_CFG[key];
  const busca = (document.getElementById(`busca_${key}`).value || "").toLowerCase();
  const todos = catalogoCache[key] || [];
  const filtrados = todos.filter(x => !busca || c.campos.some(([id]) => String(x[id] ?? "").toLowerCase().includes(busca)));
  const total = filtrados.length;
  const totalPaginas = Math.max(1, Math.ceil(total / CATALOGOS_PAGINA));
  if ((catalogoPagina[key] || 1) > totalPaginas) catalogoPagina[key] = totalPaginas;
  const ini = ((catalogoPagina[key] || 1) - 1) * CATALOGOS_PAGINA;
  const pagina = filtrados.slice(ini, ini + CATALOGOS_PAGINA);
  const container = document.getElementById(`lista_cat_${key}`);

  if (total === 0) {
    container.innerHTML = "<p class='subtitle'>Nenhum registro.</p>";
  } else {
    let html = "<table class='tabela-frequencia'><thead><tr>";
    c.campos.forEach(([id]) => html += `<th>${id}</th>`);
    if (c.pai) html += `<th>${escaparHtmlEbd(c.pai.rotulo)}</th>`;
    html += "<th></th></tr></thead><tbody>";
    pagina.forEach(x => {
      html += "<tr>";
      c.campos.forEach(([id]) => html += `<td>${escaparHtmlEbd(x[id] ?? "-")}</td>`);
      if (c.pai) html += `<td>${escaparHtmlEbd((catalogoCache[`_pai_${key}`] || {})[x[c.pai.campo]]) || "-"}</td>`;
      html += `<td class="acoes-inline">
        ${authGeral ? `<button class="btn-link" data-on-click="editarCatalogo" data-args-click="${argsAttr(String(key ?? ""), String(x[c.idField] ?? ""))}">Editar</button>
        <button class="btn-link btn-link-perigo" data-on-click="excluirCatalogo" data-args-click="${argsAttr(String(key ?? ""), String(x[c.idField] ?? ""))}">Excluir</button>` : ""}
      </td></tr>`;
    });
    html += "</tbody></table>";
    container.innerHTML = html;
  }

  document.getElementById(`info_${key}`).textContent = `${total} registro(s)`;
  document.getElementById(`pag_${key}`).innerHTML = totalPaginas > 1 ? `
    <button ${catalogoPagina[key] === 1 ? "disabled" : ""} data-on-click="mudarPaginaCatalogo" data-args-click="${argsAttr(String(key ?? ""), -1)}">←</button>
    <span class="info-pagina">${escaparHtmlEbd(catalogoPagina[key])} / ${totalPaginas}</span>
    <button ${catalogoPagina[key] === totalPaginas ? "disabled" : ""} data-on-click="mudarPaginaCatalogo" data-args-click="${argsAttr(String(key ?? ""), 1)}">→</button>` : "";
}

function mudarPaginaCatalogo(key, delta) {
  catalogoPagina[key] = (catalogoPagina[key] || 1) + delta;
  renderizarCatalogo(key);
}

function editarCatalogo(key, id) {
  const c = CATALOGOS_CFG[key];
  window._editandoCatalogo = { key, id };
  const x = (catalogoCache[key] || []).find(y => String(y[c.idField]) === String(id));
  if (!x) return;
  c.campos.forEach(([fid]) => document.getElementById(`cat_${key}_${fid}`).value = x[fid] ?? "");
  if (c.pai) document.getElementById(`cat_${key}_${c.pai.campo}`).value = x[c.pai.campo] ?? "";
  document.getElementById(`cat_${key}_${c.campos[0][0]}`).scrollIntoView({ behavior: "smooth", block: "center" });
}

async function salvarCatalogo(key) {
  const c = CATALOGOS_CFG[key];
  const dados = {};
  c.campos.forEach(([fid]) => dados[fid] = document.getElementById(`cat_${key}_${fid}`).value.trim());
  if (c.campos.some(([fid, , , opcional]) => !opcional && !dados[fid])) { mostrarToast("Preencha todos os campos obrigatórios.", "erro"); return; }
  c.campos.forEach(([fid, , , opcional]) => { if (opcional && !dados[fid]) dados[fid] = null; });
  if (c.pai) dados[c.pai.campo] = document.getElementById(`cat_${key}_${c.pai.campo}`).value || null;
  const editando = window._editandoCatalogo && window._editandoCatalogo.key === key ? window._editandoCatalogo.id : null;
  const body = editando ? { id: editando, ...dados } : dados;
  const res = await fetchProtegido(`${API_BASE}/catalogos/${key}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await res.json();
  avisarResultado(data);
  if (data.sucesso) {
    window._editandoCatalogo = null;
    c.campos.forEach(([fid]) => document.getElementById(`cat_${key}_${fid}`).value = "");
    if (c.pai) document.getElementById(`cat_${key}_${c.pai.campo}`).value = "";
    carregarCatalogoLista(key);
  }
}

async function excluirCatalogo(key, id) {
  if (!(await confirmarAcao("Excluir este registro?", "Excluir"))) return;
  const res = await fetchProtegido(`${API_BASE}/catalogos/${key}/${id}`, { method: "DELETE" });
  const data = await res.json();
  avisarResultado(data);
  carregarCatalogoLista(key);
}

let sessaoFrequenciaAberta = null; // { sessaoId, descricao } — pra atualizar a tela após encerrar/justificar

// Submenu de Reuniões — gerado em runtime a partir do catálogo de Órgãos
// (nunca hardcoded): se um órgão for renomeado ou excluído na aba Órgãos, o
// submenu reflete isso na próxima vez que a aba Reuniões for aberta. O mesmo
// bloco de conteúdo é reaproveitado pra qualquer órgão selecionado — só o
// bloco de Elegíveis (exclusivo da Assembleia Geral) muda de visibilidade.
// v3.6.2 — o submenu junta os 5 órgãos centrais com as JAI/JEA/TER/CRA/CRAF/
// CEQ/CAQ/CDE/JUC territoriais (OrgaosLocais). Cada item ganha uma chave
// composta (`central:5`/`local:12`, mesmo padrão do form de Processo
// Disciplinar) — nenhum bloco de UI novo: território cai no formulário
// genérico de reunião simples, igual qualquer órgão sem composição especial.
// v4.2.3 — separado em dois módulos (pedido explícito): Órgãos Centrais
// (únicos na denominação) e Órgãos Regionais (territoriais, escopados por
// MeusOrgaosLocais). Ambos escrevem no MESMO window._orgaosReunioesCache —
// não precisa de dois nomes, porque só um dos dois módulos está aberto por
// vez (mostrarAbaSecretaria('reunioes') só é chamado a partir de um deles).
function renderizarListaOrgaosModulo(containerId, lista) {
  document.getElementById(containerId).innerHTML = lista.map(o => `
    <button class="btn-aba" id="btnSubReunioes${escaparHtmlEbd(o.chave.replace(":", "_"))}" data-on-click="selecionarOrgaoReunioes" data-args-click="${argsAttr(String(o.chave ?? ""))}">
      <span class="icone">🏛️</span><span class="rotulo">${escaparHtmlEbd(o.nome)}</span>
    </button>`).join("");
}

async function montarSubmenuOrgaosCentrais() {
  const res = await fetchProtegido(`${API_BASE}/orgaos`);
  const brutos = await jsonDaTela(res, document.getElementById("submenuOrgaosCentrais"), "lista");
  if (brutos === null) return;
  const orgaos = brutos.map(o => Object.assign({}, o, { chave: `central:${o.orgaoId}` }));
  window._orgaosReunioesCache = orgaos;
  renderizarListaOrgaosModulo("submenuOrgaosCentrais", orgaos);
  if (orgaos.length === 0) return;
  const aindaExiste = orgaos.some(o => o.chave === window._orgaoAtualReunioes);
  selecionarOrgaoReunioes(aindaExiste ? window._orgaoAtualReunioes : orgaos[0].chave);
}

// meus-orgaos-locais (não catalogos/orgaosLocais): escopado por quem está
// logado, senão um Pastor de Área via a lista de TODAS as JAIs da
// denominação em vez de só as da própria área (v4.2.2).
async function montarSubmenuOrgaosRegionais() {
  const res = await fetchProtegido(`${API_BASE}/meus-orgaos-locais`);
  const brutos = await jsonDaTela(res, document.getElementById("submenuOrgaosRegionais"), "lista");
  if (brutos === null) return;
  const locais = brutos
    .map(o => Object.assign({}, o, { chave: `local:${o.orgaoLocalId}`, nome: `${o.sigla} — ${o.nome}` }));
  window._orgaosReunioesCache = locais;
  renderizarListaOrgaosModulo("submenuOrgaosRegionais", locais);
  if (locais.length === 0) return;
  const aindaExiste = locais.some(o => o.chave === window._orgaoAtualReunioes);
  selecionarOrgaoReunioes(aindaExiste ? window._orgaoAtualReunioes : locais[0].chave);
}

function selecionarOrgaoReunioes(chave) {
  const orgaos = window._orgaosReunioesCache || [];
  const orgao = orgaos.find(o => o.chave === chave);
  if (!orgao) return;

  const ehAssembleia = orgao.sigla === "ASSEMBLEIA_GERAL";
  const ehCLI = orgao.sigla === "CLI";
  const ehDiretoria = orgao.sigla === "DIRETORIA_EXECUTIVA";
  const ehConselhoFiscal = orgao.sigla === "CONSELHO_FISCAL";
  const ehCEI = orgao.sigla === "CEI";
  window._orgaoAtualReunioes = chave;
  document.getElementById("reuniaoOrgao").value = chave;
  document.getElementById("reunioesOrgaoNome").textContent = orgao.nome;
  document.getElementById("blocoElegiveisAssembleia").style.display = ehAssembleia ? "block" : "none";
  document.getElementById("blocoComposicaoCLI").style.display = ehCLI ? "block" : "none";
  document.getElementById("blocoDiretoria").style.display = ehDiretoria ? "block" : "none";
  document.getElementById("blocoConselhoFiscal").style.display = ehConselhoFiscal ? "block" : "none";
  document.getElementById("blocoCEI").style.display = ehCEI ? "block" : "none";
  // Assembleia Geral não abre na hora (Art. 20) — troca o formulário instantâneo
  // pelo par Convocar (com antecedência) / Iniciar (no dia previsto).
  document.getElementById("blocoConvocarAssembleia").style.display = ehAssembleia ? "block" : "none";
  document.getElementById("blocoAbrirReuniaoSimples").style.display = ehAssembleia ? "none" : "block";
  orgaos.forEach(o => {
    const btn = document.getElementById(`btnSubReunioes${o.chave.replace(":", "_")}`);
    if (btn) btn.classList.toggle("ativo", o.chave === chave);
  });

  if (ehAssembleia) carregarConvocacoesPendentes();
  if (ehCLI) { carregarComposicaoCLI(); carregarAssentosCLI(); carregarComissoes(); carregarProjetos(); }
  if (ehDiretoria) { carregarAssentosDiretoria(); carregarSucessaoPresidencial(); }
  if (ehConselhoFiscal) { carregarAssentosConselhoFiscal(); if (authGeral) carregarMedidasCautelares(); } // medidas cautelares: rota inteira só do geral
  if (ehCEI) carregarAssentosCEI();
  carregarReunioes();
}

function orgaoIdCLI() {
  const orgao = (window._orgaosReunioesCache || []).find(o => o.sigla === "CLI");
  return orgao ? orgao.orgaoId : null;
}

async function carregarComposicaoCLI() {
  const container = document.getElementById("resultadoComposicaoCLI");
  const res = await fetchProtegido(`${API_BASE}/cli/composicao`);
  const composicao = await jsonDaTela(res, container, "lista");
  if (composicao === null) return;
  if (!Array.isArray(composicao) || composicao.length === 0) {
    container.innerHTML = "<p class='subtitle'>Ninguém compõe a CLI ainda.</p>";
    return;
  }
  let html = `<table class="tabela-frequencia"><thead><tr>
    <th>Matrícula</th><th>Nome</th><th>Congregação</th><th>Como entra</th><th>Situação</th>
  </tr></thead><tbody>`;
  composicao.forEach(m => {
    let comoEntra;
    if (m.viaOrdenacao) comoEntra = `Ordenação (${escaparHtmlEbd(nomeCargoPorSigla(m.cargoMinisterial))})`;
    else if (m.orgaoOrigemNome && m.orgaoOrigemNome !== "Câmara de Liderança Institucional") comoEntra = `Função (${escaparHtmlEbd(m.cargoOuFuncao) || "-"}, herdado da ${escaparHtmlEbd(m.orgaoOrigemNome)})`;
    else comoEntra = `Função (${escaparHtmlEbd(m.cargoOuFuncao) || "-"})`;
    const situacao = m.processoDisciplinarAtivo ? "Sob disciplina (não conta)" : (!m.emComunhao ? "Sem comunhão (não conta)" : "Ativo");
    html += `<tr>
      <td>${m.membroId}</td>
      <td>${escaparHtmlEbd(m.nome)}</td>
      <td>${escaparHtmlEbd(m.congregacao) || "-"}</td>
      <td>${comoEntra}</td>
      <td>${situacao}</td>
    </tr>`;
  });
  html += "</tbody></table>";
  container.innerHTML = html;
}

async function carregarAssentosCLI() {
  const container = document.getElementById("resultadoListaAssentosCLI");
  const orgaoId = orgaoIdCLI();
  if (!orgaoId) return;
  const res = await fetchProtegido(`${API_BASE}/assentos?orgaoId=${orgaoId}`);
  const assentos = await jsonDaTela(res, container, "lista");
  if (assentos === null) return;
  if (!Array.isArray(assentos) || assentos.length === 0) {
    container.innerHTML = "<p class='subtitle'>Nenhuma cadeira aberta direto na CLI ainda.</p>";
    return;
  }
  let html = `<table class="tabela-frequencia"><thead><tr>
    <th>Matrícula</th><th>Nome</th><th>Cargo/Função</th><th>Desde</th><th>Até</th><th>Situação</th><th></th>
  </tr></thead><tbody>`;
  assentos.forEach(a => {
    html += `<tr>
      <td>${a.membroId}</td>
      <td>${escaparHtmlEbd(a.nome)}</td>
      <td>${escaparHtmlEbd(a.cargoOuFuncao) || "-"}</td>
      <td>${escaparHtmlEbd(a.dataInicio)}</td>
      <td>${escaparHtmlEbd(a.dataTerminoPrevisao) || "sem prazo"}</td>
      <td>${badgeSituacaoAssento(a.situacaoEfetiva)}</td>
      <td class="acoes-inline">${authGeral ? `<button class="btn-link btn-link-perigo" data-on-click="encerrarAssentoCLIAcao" data-args-click="${argsAttr(a.assentoId)}">Encerrar</button>` : ""}</td>
    </tr>`;
  });
  html += "</tbody></table>";
  container.innerHTML = html;
}

async function salvarAssentoCLI() {
  const orgaoId = orgaoIdCLI();
  const membroId = document.getElementById("assentoCLIMatricula").value;
  const cargoOuFuncao = document.getElementById("assentoCLIFuncao").value;
  const duracaoMeses = document.getElementById("assentoCLIDuracaoMeses").value || null;
  const msg = document.getElementById("resultadoAssentoCLI");
  if (!orgaoId || !membroId) { msg.textContent = "Informe a matrícula."; return; }
  const res = await fetchProtegido(`${API_BASE}/assentos`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ membroId, orgaoId, tipoAssento: "FUNCAO", cargoOuFuncao, duracaoMeses })
  });
  const data = await res.json();
  avisarResultado(data);
  msg.textContent = data.mensagem || "";
  if (data.sucesso) {
    document.getElementById("assentoCLIMatricula").value = "";
    document.getElementById("assentoCLIDuracaoMeses").value = "";
    carregarAssentosCLI();
    carregarComposicaoCLI();
  }
}

async function encerrarAssentoCLIAcao(assentoId) {
  if (!(await confirmarAcao("Encerrar esta cadeira?", "Encerrar"))) return;
  const res = await fetchProtegido(`${API_BASE}/assentos/${assentoId}/encerrar`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({})
  });
  const data = await res.json();
  avisarResultado(data);
  if (data.sucesso) { carregarAssentosCLI(); carregarComposicaoCLI(); }
}

// siglaCadastroManual: 'ccj'/'pmo' pras comissões de cadastro manual
// (mostra "Remover"), false/undefined pras calculadas (CFO/CEP, só leitura).
function tabelaComissaoCalculada(lista, siglaCadastroManual) {
  if (!Array.isArray(lista) || lista.length === 0) return "<p class='subtitle'>Ninguém compõe essa comissão ainda.</p>";
  let html = `<table class="tabela-frequencia"><thead><tr>
    <th>Matrícula</th><th>Nome</th>${siglaCadastroManual ? "<th>Desde</th><th></th>" : "<th>Cargo/Origem</th>"}
  </tr></thead><tbody>`;
  lista.forEach(m => {
    html += `<tr>
      <td>${m.membroId}</td>
      <td>${escaparHtmlEbd(m.nome)}</td>
      ${siglaCadastroManual
        ? `<td>${escaparHtmlEbd(m.dataInicio)}</td><td>${authGeral ? `<button class="btn-link btn-link-perigo" data-on-click="removerMembroComissaoAcao" data-args-click="${argsAttr(String(siglaCadastroManual), m.comissaoMembroId)}">Remover</button>` : ""}</td>`
        : `<td>${escaparHtmlEbd(m.cargoOuFuncao) || "-"}${m.origemSigla ? ` (${escaparHtmlEbd(m.origemSigla)})` : ""}</td>`}
    </tr>`;
  });
  html += "</tbody></table>";
  return html;
}

async function removerMembroComissaoAcao(sigla, comissaoMembroId) {
  if (!(await confirmarAcao(`Remover este membro da ${sigla.toUpperCase()}?`, "Remover"))) return;
  const res = await fetchProtegido(`${API_BASE}/comissoes/${sigla}/${comissaoMembroId}/encerrar`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({})
  });
  const data = await res.json();
  avisarResultado(data);
  if (data.sucesso) carregarComissoes();
}

async function carregarComissoes() {
  const res = await fetchProtegido(`${API_BASE}/comissoes`);
  const data = await jsonDaTela(res, ["resultadoListaCCJ", "resultadoListaCFO", "resultadoListaCEP", "resultadoListaPMO"].map(id => document.getElementById(id)), "objeto");
  if (data === null) return;
  window._ccjCache = data.CCJ || [];
  if (document.getElementById("resultadoListaCCJ")) document.getElementById("resultadoListaCCJ").innerHTML = tabelaComissaoCalculada(data.CCJ, "ccj");
  if (document.getElementById("resultadoListaCFO")) document.getElementById("resultadoListaCFO").innerHTML = tabelaComissaoCalculada(data.CFO, false);
  if (document.getElementById("resultadoListaCEP")) document.getElementById("resultadoListaCEP").innerHTML = tabelaComissaoCalculada(data.CEP, false);
  // v4.8 (segunda parte) — PMO reaproveita a mesma tabela de exibição da CCJ.
  if (document.getElementById("resultadoListaPMO")) document.getElementById("resultadoListaPMO").innerHTML = tabelaComissaoCalculada(data.PMO, "pmo");
}

async function adicionarMembroCCJ() {
  const membroId = document.getElementById("ccjMatricula").value;
  const msg = document.getElementById("resultadoCCJ");
  if (!membroId) { msg.textContent = "Informe a matrícula."; return; }
  const res = await fetchProtegido(`${API_BASE}/comissoes/ccj`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ membroId })
  });
  const data = await res.json();
  avisarResultado(data);
  msg.textContent = data.mensagem || "";
  if (data.sucesso) {
    document.getElementById("ccjMatricula").value = "";
    carregarComissoes();
  }
}

// v4.8 (segunda parte) — Comissão de Acompanhamento de Projetos / PMO
// Eclesiástico (Art. 30), mesmo padrão de cadastro manual da CCJ.
async function adicionarMembroPMO() {
  const membroId = document.getElementById("pmoMatricula").value;
  const msg = document.getElementById("resultadoPMO");
  if (!membroId) { msg.textContent = "Informe a matrícula."; return; }
  const res = await fetchProtegido(`${API_BASE}/comissoes/pmo`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ membroId })
  });
  const data = await res.json();
  avisarResultado(data);
  msg.textContent = data.mensagem || "";
  if (data.sucesso) {
    document.getElementById("pmoMatricula").value = "";
    carregarComissoes();
  }
}

// ---- SECRETARIA / ABA ESTRUTURA / CONGREGAÇÕES (vC.2) ----
// Tela própria (não usa o editor genérico de catálogos — campos demais pra
// caber numa linha de inputs): endereço/bairro/cidade/estado/horários/mapa,
// os mesmos campos que hoje só existem na coleção "congregacoes" do
// Directus (site institucional). Dirigente atual é só exibido (calculado no
// backend a partir de quem já tem o papel "Dirigente de Congregação" em
// Permissões) — não tem input pra ele porque não é editável aqui.
let congregacaoDetalheEditandoId = null;

async function carregarCongregacoesDetalhe() {
  const [resCong, resAreas] = await Promise.all([
    fetchProtegido(`${API_BASE}/catalogos/congregacoes`),
    fetchProtegido(`${API_BASE}/catalogos/areas`)
  ]);
  const congregacoes = await jsonDaTela(resCong, document.getElementById("listaCongDetalhe"), "lista");
  if (congregacoes === null) return;
  const areas = await listaDaApi(resAreas);
  window._congregacoesDetalheCache = congregacoes;
  window._areasCache = areas;

  const selectArea = document.getElementById("congDetAreaId");
  if (selectArea) selectArea.innerHTML = `<option value="">Sem Área</option>` + areas.map(a => `<option value="${a.areaId}">${escaparHtmlEbd(a.nome)}</option>`).join("");

  const container = document.getElementById("listaCongDetalhe");
  if (!container) return;
  if (congregacoes.length === 0) {
    container.innerHTML = "<p class='subtitle'>Nenhuma congregação cadastrada.</p>";
    return;
  }
  let html = `<table class="tabela-frequencia"><thead><tr>
    <th>Nome</th><th>Cidade/UF</th><th>Dirigente atual</th><th>Status</th><th></th>
  </tr></thead><tbody>`;
  congregacoes.forEach(c => {
    html += `<tr>
      <td>${escaparHtmlEbd(c.nome)}</td>
      <td>${c.cidade ? `${escaparHtmlEbd(c.cidade)}${c.estado ? "/" + escaparHtmlEbd(c.estado) : ""}${c.cep ? " · " + escaparHtmlEbd(c.cep) : ""}` : "—"}</td>
      <td>${escaparHtmlEbd(c.dirigenteAtual) || "—"}</td>
      <td>${c.ativa ? "Ativa" : "Inativa"}</td>
      <td class="acoes-inline">
        <button class="btn-link" data-on-click="editarCongregacaoDetalhe" data-args-click="${argsAttr(c.congregacaoId)}">Editar</button>
        ${c.ativa
          ? `<button class="btn-link" data-on-click="desativarCongregacaoDetalheAcao" data-args-click="${argsAttr(c.congregacaoId)}">Desativar</button>`
          : `<button class="btn-link" data-on-click="reativarCongregacaoDetalheAcao" data-args-click="${argsAttr(c.congregacaoId)}">Reativar</button>`}
        <button class="btn-link btn-link-perigo" data-on-click="excluirCongregacaoDetalheAcao" data-args-click="${argsAttr(c.congregacaoId)}">Excluir</button>
      </td>
    </tr>`;
  });
  html += "</tbody></table>";
  container.innerHTML = html;
}

function editarCongregacaoDetalhe(id) {
  const c = (window._congregacoesDetalheCache || []).find(x => x.congregacaoId === id);
  if (!c) return;
  congregacaoDetalheEditandoId = id;
  document.getElementById("congDetNome").value = c.nome || "";
  document.getElementById("congDetAreaId").value = c.areaId || "";
  document.getElementById("congDetFundacaoAno").value = c.fundacaoAno ?? "";
  document.getElementById("congDetEndereco").value = c.endereco || "";
  document.getElementById("congDetBairro").value = c.bairro || "";
  document.getElementById("congDetCidade").value = c.cidade || "";
  document.getElementById("congDetEstado").value = c.estado || "";
  document.getElementById("congDetCep").value = c.cep || "";
  document.getElementById("congDetNotaEndereco").value = c.notaEndereco || "";
  document.getElementById("congDetHorarios").value = c.horarios || "";
  document.getElementById("congDetMapsUrl").value = c.mapsUrl || "";
  document.getElementById("congDetLat").value = c.lat ?? "";
  document.getElementById("congDetLng").value = c.lng ?? "";
  document.getElementById("congDetGoogleMapsPlaceQuery").value = c.googleMapsPlaceQuery || "";
  document.getElementById("congDetNome").scrollIntoView({ behavior: "smooth", block: "center" });
}

function limparFormCongregacaoDetalhe() {
  congregacaoDetalheEditandoId = null;
  ["congDetNome", "congDetAreaId", "congDetFundacaoAno", "congDetEndereco", "congDetBairro", "congDetCidade",
   "congDetEstado", "congDetCep", "congDetNotaEndereco", "congDetHorarios", "congDetMapsUrl",
   "congDetLat", "congDetLng", "congDetGoogleMapsPlaceQuery"]
    .forEach(id => { const el = document.getElementById(id); if (el) el.value = ""; });
}

async function salvarCongregacaoDetalhe() {
  const nome = document.getElementById("congDetNome").value.trim();
  const msg = document.getElementById("resultadoCongDetalhe");
  if (!nome) { msg.textContent = "Informe o nome da congregação."; return; }

  const corpo = {
    nome,
    areaId: document.getElementById("congDetAreaId").value || null,
    fundacaoAno: document.getElementById("congDetFundacaoAno").value || null,
    endereco: document.getElementById("congDetEndereco").value.trim() || null,
    bairro: document.getElementById("congDetBairro").value.trim() || null,
    cidade: document.getElementById("congDetCidade").value.trim() || null,
    estado: document.getElementById("congDetEstado").value.trim().toUpperCase() || null,
    cep: document.getElementById("congDetCep").value.trim() || null,
    notaEndereco: document.getElementById("congDetNotaEndereco").value.trim() || null,
    horarios: document.getElementById("congDetHorarios").value.trim() || null,
    mapsUrl: document.getElementById("congDetMapsUrl").value.trim() || null,
    lat: document.getElementById("congDetLat").value || null,
    lng: document.getElementById("congDetLng").value || null,
    googleMapsPlaceQuery: document.getElementById("congDetGoogleMapsPlaceQuery").value.trim() || null
  };
  if (congregacaoDetalheEditandoId) corpo.id = congregacaoDetalheEditandoId;

  const res = await fetchProtegido(`${API_BASE}/catalogos/congregacoes`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo)
  });
  const data = await res.json();
  msg.textContent = data.mensagem;
  if (data.sucesso) {
    limparFormCongregacaoDetalhe();
    carregarCongregacoesDetalhe();
  }
}

async function desativarCongregacaoDetalheAcao(id) {
  if (!(await confirmarAcao("Confirma desativar esta congregação? Ela some das listas de cadastro, mas o histórico continua.", "Desativar"))) return;
  const res = await fetchProtegido(`${API_BASE}/catalogos/congregacoes`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, ativa: false })
  });
  const data = await res.json();
  avisarResultado(data);
  if (data.sucesso) carregarCongregacoesDetalhe();
}

async function reativarCongregacaoDetalheAcao(id) {
  const res = await fetchProtegido(`${API_BASE}/catalogos/congregacoes`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, ativa: true })
  });
  const data = await res.json();
  avisarResultado(data);
  if (data.sucesso) carregarCongregacoesDetalhe();
}

async function excluirCongregacaoDetalheAcao(id) {
  if (!(await confirmarAcao("Confirma EXCLUIR esta congregação? Isso não pode ser desfeito. Só funciona se nenhuma pessoa estiver cadastrada nela.", "Excluir"))) return;
  const res = await fetchProtegido(`${API_BASE}/catalogos/congregacoes/${id}`, { method: "DELETE" });
  const data = await res.json();
  avisarResultado(data);
  if (data.sucesso) carregarCongregacoesDetalhe();
}

registrarAcoes({
  adicionarMembroCCJ, adicionarMembroPMO, desativarCongregacaoDetalheAcao, editarCatalogo, editarCongregacaoDetalhe, encerrarAssentoCLIAcao,
  excluirCatalogo, excluirCongregacaoDetalheAcao, filtrarCatalogo, limparFormCongregacaoDetalhe, mudarPaginaCatalogo, reativarCongregacaoDetalheAcao,
  removerMembroComissaoAcao, salvarAssentoCLI, salvarCatalogo, salvarCongregacaoDetalhe, selecionarOrgaoReunioes
});
