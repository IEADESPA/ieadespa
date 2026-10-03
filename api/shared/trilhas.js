// shared/trilhas.js (v6.9 — Trilhas de formação e certificação verificável)
//
// Abre a formação como entidade de primeira classe: uma Trilha (por papel —
// professor de EBD, diácono, tesoureiro local, dirigente, secretário...) tem
// Módulos com pré-requisitos; a pessoa se matricula, conclui módulo a
// módulo, e ao concluir o último obrigatório a matrícula se conclui SOZINHA
// e o certificado é emitido (shared/certificados.js) com código público,
// selo de integridade e validade. A conclusão vira PRÉ-REQUISITO VERIFICADO
// nos fluxos que já existem (TrilhaRequisitos): consagração, nomeação de
// liderança, treinamento da habilitação de voluntário (v5.7), item IV do
// batismo (vB.11), equipe de escala e designação de professor de EBD.
//
// Princípios (os mesmos da FASE 6):
// - Situação NUNCA é digitada: vigente/vencendo/vencida/revogada é sempre
//   CALCULADA na leitura, a partir da conclusão, da validade e da revogação
//   do certificado — sem job/timer (mesmo espírito de
//   habilitacaoVoluntarios.calcularStatusHabilitacao).
// - Requisito NASCE VAZIO: enquanto ninguém configurar, nenhum fluxo muda.
//   Cada requisito é BLOQUEIA (impede) ou ALERTA (só avisa) — "não bloqueia
//   culto, mas bloqueia escala onde a norma exigir".
// - Lógica de decisão pura (testável sem banco) primeiro, funções de banco
//   (finas) depois.
const { sql } = require("./db");
const { registrarAuditoria } = require("./auditoria");
const certificados = require("./certificados");

const CONTEXTOS = ["CONSAGRACAO", "LIDERANCA", "HABILITACAO_TREINAMENTO", "BATISMO_DISCIPULADO", "ESCALA_EQUIPE", "EBD_PROFESSOR"];
const CONTEXTOS_COM_ALVO = ["CONSAGRACAO", "LIDERANCA", "ESCALA_EQUIPE"];
const CONTEXTOS_ALVO_NUMERICO = ["LIDERANCA", "ESCALA_EQUIPE"];
const MODOS = ["BLOQUEIA", "ALERTA"];
const ROTULO_CONTEXTO = {
  CONSAGRACAO: "Consagração", LIDERANCA: "Nomeação de liderança", HABILITACAO_TREINAMENTO: "Habilitação de voluntário (treinamento)",
  BATISMO_DISCIPULADO: "Batismo (curso de discipulado)", ESCALA_EQUIPE: "Equipe de escala", EBD_PROFESSOR: "Professor de EBD"
};
const STATUS_MATRICULA = { EM_ANDAMENTO: "EM_ANDAMENTO", CONCLUIDA: "CONCLUIDA", CANCELADA: "CANCELADA" };
// Quanto maior, melhor: a formação que vale é a de maior rank.
const RANK_SITUACAO = { VIGENTE: 5, VENCENDO: 4, EM_ANDAMENTO: 3, VENCIDA: 2, REVOGADA: 1, CANCELADA: 0 };
const LIMITE_LISTA_SQL = 500;

// ---------------------------------------------------------------
// Lógica pura — utilidades
// ---------------------------------------------------------------

const limpar = (v) => String(v == null ? "" : v).trim();

// Trava 6-B: o alvo do requisito (ex.: o nome do tipo de consagração) é
// digitado à mão, e o assunto da consagração também pode ser texto livre
// ("Outro"). Comparar com === deixava "Consagração a Diácono" sem efeito
// sobre "consagração a diácono" — o requisito BLOQUEIA simplesmente não se
// aplicava. A comparação ignora maiúscula, acento e espaços repetidos.
function normalizarAlvo(v) {
  return limpar(v).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ");
}
function alvoCorresponde(alvoDoRequisito, alvo) {
  return normalizarAlvo(alvoDoRequisito) === normalizarAlvo(alvo);
}
const arred1 = (n) => Math.round(n * 10) / 10;

function dataIsoValida(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ""));
  if (!m) return false;
  const a = Number(m[1]), me = Number(m[2]), d = Number(m[3]);
  const dt = new Date(Date.UTC(a, me - 1, d));
  return dt.getUTCFullYear() === a && dt.getUTCMonth() === me - 1 && dt.getUTCDate() === d;
}

function hojeIsoLocal() {
  return require("./dataBrasilia").hojeBrasilia(); // Trava 6-B: dia de Brasília, não do servidor (UTC)
}

function paraUtc(iso) {
  const [a, m, d] = iso.split("-").map(Number);
  return Date.UTC(a, m - 1, d);
}

// Dias de `alvoIso` até `baseIso` (positivo = alvo no futuro).
function diasAte(alvoIso, baseIso) {
  return Math.round((paraUtc(alvoIso) - paraUtc(baseIso)) / 86400000);
}

function formatarDataBr(iso) {
  if (!iso) return "";
  const [a, m, d] = String(iso).slice(0, 10).split("-");
  return `${d}/${m}/${a}`;
}

// 31/jan + 1 mês = 28/fev (não 3/mar): o último dia do mês de destino é o teto.
function calcularValidade(dataConclusaoIso, validadeMeses) {
  if (!validadeMeses || !dataIsoValida(dataConclusaoIso)) return null;
  const [a, m, d] = dataConclusaoIso.split("-").map(Number);
  const alvoIdx = (m - 1) + Number(validadeMeses);
  const ano = a + Math.floor(alvoIdx / 12);
  const mes = (alvoIdx % 12) + 1;
  const ultimoDia = new Date(Date.UTC(ano, mes, 0)).getUTCDate();
  return `${ano}-${String(mes).padStart(2, "0")}-${String(Math.min(d, ultimoDia)).padStart(2, "0")}`;
}

// ---------------------------------------------------------------
// Lógica pura — catálogo
// ---------------------------------------------------------------

function validarNovaTrilha({ nome, descricao, papelAlvo, validadeMeses, avisoDias } = {}) {
  const n = limpar(nome);
  if (n.length < 3) return { valido: false, mensagem: "Informe o nome da trilha (mínimo 3 caracteres)." };
  if (n.length > 150) return { valido: false, mensagem: "O nome da trilha passa de 150 caracteres." };
  const desc = limpar(descricao);
  if (desc.length > 500) return { valido: false, mensagem: "A descrição passa de 500 caracteres." };
  const papel = limpar(papelAlvo);
  if (papel.length > 60) return { valido: false, mensagem: "O papel-alvo passa de 60 caracteres." };

  let validade = null;
  if (validadeMeses != null && limpar(validadeMeses) !== "") {
    const v = Number(validadeMeses);
    if (!Number.isInteger(v) || v < 1 || v > 120) return { valido: false, mensagem: "A validade do certificado deve ser de 1 a 120 meses (deixe em branco se não vence)." };
    validade = v;
  }
  let aviso = 60;
  if (avisoDias != null && limpar(avisoDias) !== "") {
    const a = Number(avisoDias);
    if (!Number.isInteger(a) || a < 0 || a > 365) return { valido: false, mensagem: "O aviso de vencimento deve ser de 0 a 365 dias." };
    aviso = a;
  }
  return { valido: true, dados: { nome: n, descricao: desc || null, papelAlvo: papel || null, validadeMeses: validade, avisoDias: aviso } };
}

function validarNovoModulo({ titulo, ordem, cargaHoraria, obrigatorio } = {}) {
  const t = limpar(titulo);
  if (t.length < 2) return { valido: false, mensagem: "Informe o título do módulo (mínimo 2 caracteres)." };
  if (t.length > 150) return { valido: false, mensagem: "O título do módulo passa de 150 caracteres." };
  let ord = null;
  if (ordem != null && limpar(ordem) !== "") {
    ord = Number(ordem);
    if (!Number.isInteger(ord) || ord < 1) return { valido: false, mensagem: "A ordem deve ser um número inteiro a partir de 1." };
  }
  let carga = 0;
  if (cargaHoraria != null && limpar(cargaHoraria) !== "") {
    carga = Number(cargaHoraria);
    if (Number.isNaN(carga) || carga < 0 || carga > 999) return { valido: false, mensagem: "A carga horária deve estar entre 0 e 999 horas." };
    carga = arred1(carga);
  }
  const obrig = !(obrigatorio === false || obrigatorio === 0 || obrigatorio === "false" || obrigatorio === "0");
  return { valido: true, dados: { titulo: t, ordem: ord, cargaHoraria: carga, obrigatorio: obrig } };
}

// Pré-requisito de módulo: da MESMA trilha e de Ordem menor — sem ciclo por construção.
function validarPreRequisitoModulo(modulo, preRequisito) {
  if (!modulo || !preRequisito) return { valido: false, mensagem: "Módulo não encontrado." };
  if (modulo.moduloId === preRequisito.moduloId) return { valido: false, mensagem: "Um módulo não pode ser pré-requisito dele mesmo." };
  if (modulo.trilhaId !== preRequisito.trilhaId) return { valido: false, mensagem: "O pré-requisito precisa ser um módulo da mesma trilha." };
  if (preRequisito.ordem >= modulo.ordem) return { valido: false, mensagem: "O pré-requisito precisa vir ANTES (ordem menor) do módulo." };
  return { valido: true };
}

// `arestas`: [{ trilhaId, preRequisitoTrilhaId }] já existentes. Adicionar
// "trilhaId exige preRequisitoTrilhaId" cria ciclo se preRequisito já
// (transitivamente) exige trilhaId.
function criariaCicloTrilhas(arestas, trilhaId, preRequisitoTrilhaId) {
  if (trilhaId === preRequisitoTrilhaId) return true;
  const exige = new Map();
  for (const a of arestas || []) {
    if (!exige.has(a.trilhaId)) exige.set(a.trilhaId, []);
    exige.get(a.trilhaId).push(a.preRequisitoTrilhaId);
  }
  const visitados = new Set();
  const pilha = [preRequisitoTrilhaId];
  while (pilha.length) {
    const atual = pilha.pop();
    if (atual === trilhaId) return true;
    if (visitados.has(atual)) continue;
    visitados.add(atual);
    for (const prox of exige.get(atual) || []) pilha.push(prox);
  }
  return false;
}

// ---------------------------------------------------------------
// Lógica pura — progresso individual
// ---------------------------------------------------------------

// modulos: [{ moduloId, ordem, titulo, cargaHoraria, obrigatorio, ativo }]
// preRequisitos: [{ moduloId, preRequisitoModuloId }]
// conclusoes: [{ moduloId, cargaHorariaRegistrada }]
// Status de cada módulo: CONCLUIDO | DISPONIVEL | BLOQUEADO (pré-requisito pendente).
function calcularProgresso({ modulos, preRequisitos, conclusoes }) {
  const ativos = (modulos || []).filter(m => m.ativo !== false).slice().sort((a, b) => a.ordem - b.ordem || a.moduloId - b.moduloId);
  const idsAtivos = new Set(ativos.map(m => m.moduloId));
  const titulos = new Map(ativos.map(m => [m.moduloId, m.titulo]));
  const concluidos = new Map((conclusoes || []).map(c => [c.moduloId, c]));

  const preDe = new Map();
  for (const p of preRequisitos || []) {
    if (!idsAtivos.has(p.preRequisitoModuloId)) continue; // pré-requisito desativado não trava ninguém
    if (!preDe.has(p.moduloId)) preDe.set(p.moduloId, []);
    preDe.get(p.moduloId).push(p.preRequisitoModuloId);
  }

  const itens = ativos.map(m => {
    const concluido = concluidos.has(m.moduloId);
    const pendentes = (preDe.get(m.moduloId) || []).filter(id => !concluidos.has(id));
    return {
      moduloId: m.moduloId, ordem: m.ordem, titulo: m.titulo, cargaHoraria: Number(m.cargaHoraria || 0), obrigatorio: m.obrigatorio !== false,
      concluido, status: concluido ? "CONCLUIDO" : (pendentes.length ? "BLOQUEADO" : "DISPONIVEL"),
      bloqueadoPor: concluido ? [] : pendentes.map(id => titulos.get(id))
    };
  });

  const obrigatorios = itens.filter(i => i.obrigatorio);
  const obrigatoriosConcluidos = obrigatorios.filter(i => i.concluido).length;
  let cargaConcluida = 0;
  for (const c of concluidos.values()) cargaConcluida += Number(c.cargaHorariaRegistrada || 0);
  return {
    modulos: itens,
    obrigatoriosTotal: obrigatorios.length,
    obrigatoriosConcluidos,
    percentual: obrigatorios.length ? arred1((obrigatoriosConcluidos / obrigatorios.length) * 100) : 0,
    completa: obrigatorios.length > 0 && obrigatoriosConcluidos === obrigatorios.length,
    cargaHorariaTotal: arred1(obrigatorios.reduce((s, i) => s + i.cargaHoraria, 0)),
    cargaHorariaConcluida: arred1(cargaConcluida),
    proximoModulo: obrigatorios.find(i => i.status === "DISPONIVEL") || null
  };
}

function podeConcluirModulo({ matricula, progresso, moduloId }) {
  if (!matricula) return { permitido: false, mensagem: "Matrícula não encontrada." };
  if (matricula.status !== STATUS_MATRICULA.EM_ANDAMENTO) return { permitido: false, mensagem: `Esta matrícula não está em andamento (${matricula.status}).` };
  const item = progresso.modulos.find(m => m.moduloId === Number(moduloId));
  if (!item) return { permitido: false, mensagem: "Este módulo não pertence à trilha da matrícula (ou foi desativado)." };
  if (item.concluido) return { permitido: false, mensagem: "Este módulo já foi concluído." };
  if (item.status === "BLOQUEADO") return { permitido: false, mensagem: `Conclua antes: ${item.bloqueadoPor.join(", ")}.` };
  return { permitido: true };
}

function validarDataConclusaoModulo(dataIso, hojeIso) {
  if (dataIso == null || limpar(dataIso) === "") return { valido: true, data: hojeIso };
  const d = limpar(dataIso).slice(0, 10);
  if (!dataIsoValida(d)) return { valido: false, mensagem: "Data de conclusão inválida (use AAAA-MM-DD)." };
  if (d > hojeIso) return { valido: false, mensagem: "A data de conclusão não pode ser futura." };
  return { valido: true, data: d };
}

// ---------------------------------------------------------------
// Lógica pura — situação da formação (validade)
// ---------------------------------------------------------------

// `revogada`: o certificado da matrícula foi revogado. Nunca digitada.
function situacaoFormacao({ status, validoAte, avisoDias = 60, revogada = false }, hojeIso) {
  if (status === STATUS_MATRICULA.CANCELADA) return { situacao: "CANCELADA", diasParaVencer: null };
  if (status === STATUS_MATRICULA.EM_ANDAMENTO) return { situacao: "EM_ANDAMENTO", diasParaVencer: null };
  if (revogada) return { situacao: "REVOGADA", diasParaVencer: null };
  if (!validoAte) return { situacao: "VIGENTE", diasParaVencer: null }; // trilha sem validade
  const dias = diasAte(String(validoAte).slice(0, 10), hojeIso);
  if (dias < 0) return { situacao: "VENCIDA", diasParaVencer: dias };
  if (dias <= avisoDias) return { situacao: "VENCENDO", diasParaVencer: dias };
  return { situacao: "VIGENTE", diasParaVencer: dias };
}

// De várias matrículas da mesma trilha (renovações), a que vale.
function escolherMelhor(matriculas) {
  const lista = (matriculas || []).slice();
  if (!lista.length) return null;
  lista.sort((a, b) => (RANK_SITUACAO[b.situacao] - RANK_SITUACAO[a.situacao]) || (b.matriculaId - a.matriculaId));
  return lista[0];
}

// ---------------------------------------------------------------
// Lógica pura — requisitos por fluxo
// ---------------------------------------------------------------

function validarRequisito({ contexto, alvoChave, trilhaId, modo } = {}) {
  if (!CONTEXTOS.includes(contexto)) return { valido: false, mensagem: `Contexto inválido. Use: ${CONTEXTOS.join(", ")}.` };
  if (!trilhaId || !Number.isInteger(Number(trilhaId)) || Number(trilhaId) <= 0) return { valido: false, mensagem: "Informe a trilha exigida." };
  const m = modo == null || limpar(modo) === "" ? "BLOQUEIA" : limpar(modo).toUpperCase();
  if (!MODOS.includes(m)) return { valido: false, mensagem: "Modo inválido. Use BLOQUEIA ou ALERTA." };

  const alvo = limpar(alvoChave);
  if (CONTEXTOS_COM_ALVO.includes(contexto)) {
    if (!alvo) return { valido: false, mensagem: `Informe o alvo do requisito (${contexto === "CONSAGRACAO" ? "nome do tipo de consagração" : contexto === "LIDERANCA" ? "Id do papel" : "Id da equipe"}).` };
    if (CONTEXTOS_ALVO_NUMERICO.includes(contexto) && !/^\d+$/.test(alvo)) return { valido: false, mensagem: "O alvo deste contexto é um Id numérico." };
  } else if (alvo) {
    return { valido: false, mensagem: "Este contexto vale para o fluxo inteiro — deixe o alvo em branco." };
  }
  if (alvo.length > 100) return { valido: false, mensagem: "O alvo passa de 100 caracteres." };
  return { valido: true, dados: { contexto, alvoChave: alvo, trilhaId: Number(trilhaId), modo: m } };
}

// `melhor`: a formação que vale do membro naquela trilha (ou null = nunca se
// matriculou). OK = vigente ou vencendo (esta última com alerta).
function avaliarRequisito({ requisito, melhor }) {
  const base = { requisitoId: requisito.requisitoId, trilhaId: requisito.trilhaId, trilhaNome: requisito.trilhaNome, modo: requisito.modo };
  if (!melhor) return { ...base, ok: false, situacao: "NAO_INICIADA", detalhe: "ainda não iniciada", validoAte: null, diasParaVencer: null };

  const validoAte = melhor.validoAte ? String(melhor.validoAte).slice(0, 10) : null;
  const comum = { ...base, situacao: melhor.situacao, validoAte, diasParaVencer: melhor.diasParaVencer };
  switch (melhor.situacao) {
    case "VIGENTE": return { ...comum, ok: true, detalhe: validoAte ? `vigente até ${formatarDataBr(validoAte)}` : "vigente" };
    case "VENCENDO": return { ...comum, ok: true, detalhe: `vigente, mas vence em ${melhor.diasParaVencer} dia(s) (${formatarDataBr(validoAte)})` };
    case "EM_ANDAMENTO": return { ...comum, ok: false, detalhe: `em andamento (${melhor.obrigatoriosConcluidos || 0}/${melhor.obrigatoriosTotal || 0} módulos obrigatórios)` };
    case "VENCIDA": return { ...comum, ok: false, detalhe: `vencida em ${formatarDataBr(validoAte)}` };
    case "REVOGADA": return { ...comum, ok: false, detalhe: "certificado revogado" };
    default: return { ...comum, ok: false, detalhe: "matrícula cancelada" };
  }
}

function resumirRequisitos(avaliacoes) {
  const lista = avaliacoes || [];
  const naoAtendidos = lista.filter(a => !a.ok);
  const bloqueantes = naoAtendidos.filter(a => a.modo === "BLOQUEIA");
  const descricao = (a) => `trilha "${a.trilhaNome}": ${a.detalhe}`;
  const alertas = [
    ...naoAtendidos.filter(a => a.modo === "ALERTA").map(descricao),
    ...lista.filter(a => a.ok && a.situacao === "VENCENDO").map(descricao)
  ];
  return {
    temRequisitos: lista.length > 0,
    bloqueado: bloqueantes.length > 0,
    avaliacoes: lista,
    pendencias: naoAtendidos.map(descricao),
    alertas,
    mensagemBloqueio: bloqueantes.length
      ? `Requisito de formação não cumprido — ${bloqueantes.map(descricao).join("; ")}.`
      : null
  };
}

// ---------------------------------------------------------------
// Funções de banco (finas)
// ---------------------------------------------------------------

function listaParametros(request, prefixo, valores, tipo) {
  return valores.map((v, i) => { request.input(`${prefixo}${i}`, tipo, v); return `@${prefixo}${i}`; }).join(",");
}

// ---- Catálogo ----

async function criarTrilha(pool, dados, criadaPorMembroId) {
  const validacao = validarNovaTrilha(dados);
  if (!validacao.valido) return { sucesso: false, mensagem: validacao.mensagem };
  const d = validacao.dados;

  const existente = await pool.request().input("nome", sql.NVarChar(150), d.nome).query(`SELECT TrilhaId FROM Trilhas WHERE Nome = @nome`);
  if (existente.recordset.length > 0) return { sucesso: false, mensagem: "Já existe uma trilha com este nome." };

  const result = await pool.request()
    .input("nome", sql.NVarChar(150), d.nome).input("descricao", sql.NVarChar(500), d.descricao).input("papel", sql.NVarChar(60), d.papelAlvo)
    .input("validade", sql.Int, d.validadeMeses).input("aviso", sql.Int, d.avisoDias).input("por", sql.Int, criadaPorMembroId || null)
    .query(`
      INSERT INTO Trilhas (Nome, Descricao, PapelAlvo, ValidadeMeses, AvisoDias, CriadaPorMembroId)
      OUTPUT INSERTED.TrilhaId
      VALUES (@nome, @descricao, @papel, @validade, @aviso, @por)
    `);
  const trilhaId = result.recordset[0].TrilhaId;
  await registrarAuditoria({ tabela: "Trilhas", registroId: trilhaId, acao: "TRILHA_CRIADA", usuarioId: criadaPorMembroId, dadosAntes: null, dadosDepois: d });
  return { sucesso: true, trilhaId, mensagem: "✅ Trilha criada." };
}

// Atualização parcial: só os campos enviados. Mudar a validade NÃO altera
// certificados já emitidos (a validade é gravada na conclusão).
async function atualizarTrilha(pool, { trilhaId, ativa, descricao, papelAlvo, validadeMeses, avisoDias, atualizadoPorMembroId }) {
  const atual = await pool.request().input("id", sql.Int, trilhaId).query(`SELECT * FROM Trilhas WHERE TrilhaId = @id`);
  const t = atual.recordset[0];
  if (!t) return { sucesso: false, mensagem: "Trilha não encontrada." };

  const novo = {
    nome: t.Nome,
    descricao: descricao !== undefined ? descricao : t.Descricao,
    papelAlvo: papelAlvo !== undefined ? papelAlvo : t.PapelAlvo,
    validadeMeses: validadeMeses !== undefined ? validadeMeses : t.ValidadeMeses,
    avisoDias: avisoDias !== undefined ? avisoDias : t.AvisoDias
  };
  const validacao = validarNovaTrilha(novo);
  if (!validacao.valido) return { sucesso: false, mensagem: validacao.mensagem };
  const d = validacao.dados;

  await pool.request()
    .input("id", sql.Int, trilhaId).input("descricao", sql.NVarChar(500), d.descricao).input("papel", sql.NVarChar(60), d.papelAlvo)
    .input("validade", sql.Int, d.validadeMeses).input("aviso", sql.Int, d.avisoDias)
    .input("ativa", sql.Bit, ativa === undefined ? !!t.Ativa : !!ativa)
    .query(`UPDATE Trilhas SET Descricao = @descricao, PapelAlvo = @papel, ValidadeMeses = @validade, AvisoDias = @aviso, Ativa = @ativa, AtualizadaEm = SYSUTCDATETIME() WHERE TrilhaId = @id`);

  await registrarAuditoria({
    tabela: "Trilhas", registroId: trilhaId, acao: "TRILHA_ATUALIZADA", usuarioId: atualizadoPorMembroId,
    dadosAntes: { ativa: !!t.Ativa, validadeMeses: t.ValidadeMeses, avisoDias: t.AvisoDias }, dadosDepois: { ativa: ativa === undefined ? !!t.Ativa : !!ativa, validadeMeses: d.validadeMeses, avisoDias: d.avisoDias }
  });
  return { sucesso: true, mensagem: "✅ Trilha atualizada." };
}

function mapearModulo(row) {
  return { moduloId: row.ModuloId, trilhaId: row.TrilhaId, ordem: row.Ordem, titulo: row.Titulo, cargaHoraria: Number(row.CargaHoraria), obrigatorio: !!row.Obrigatorio, ativo: !!row.Ativo };
}

async function buscarModulo(pool, moduloId) {
  const r = await pool.request().input("id", sql.Int, moduloId).query(`SELECT * FROM TrilhaModulos WHERE ModuloId = @id`);
  return r.recordset[0] ? mapearModulo(r.recordset[0]) : null;
}

async function adicionarModulo(pool, { trilhaId, titulo, ordem, cargaHoraria, obrigatorio, criadoPorMembroId }) {
  const validacao = validarNovoModulo({ titulo, ordem, cargaHoraria, obrigatorio });
  if (!validacao.valido) return { sucesso: false, mensagem: validacao.mensagem };
  const d = validacao.dados;

  const trilha = await pool.request().input("id", sql.Int, trilhaId).query(`SELECT TrilhaId FROM Trilhas WHERE TrilhaId = @id`);
  if (trilha.recordset.length === 0) return { sucesso: false, mensagem: "Trilha não encontrada." };
  const repetido = await pool.request().input("t", sql.Int, trilhaId).input("titulo", sql.NVarChar(150), d.titulo).query(`SELECT ModuloId FROM TrilhaModulos WHERE TrilhaId = @t AND Titulo = @titulo`);
  if (repetido.recordset.length > 0) return { sucesso: false, mensagem: "Já existe um módulo com este título nesta trilha." };

  let ordemFinal = d.ordem;
  if (!ordemFinal) {
    const max = await pool.request().input("t", sql.Int, trilhaId).query(`SELECT ISNULL(MAX(Ordem), 0) AS Maior FROM TrilhaModulos WHERE TrilhaId = @t`);
    ordemFinal = max.recordset[0].Maior + 1;
  }
  const result = await pool.request()
    .input("t", sql.Int, trilhaId).input("ordem", sql.Int, ordemFinal).input("titulo", sql.NVarChar(150), d.titulo)
    .input("carga", sql.Decimal(5, 1), d.cargaHoraria).input("obrig", sql.Bit, d.obrigatorio)
    .query(`INSERT INTO TrilhaModulos (TrilhaId, Ordem, Titulo, CargaHoraria, Obrigatorio) OUTPUT INSERTED.ModuloId VALUES (@t, @ordem, @titulo, @carga, @obrig)`);
  const moduloId = result.recordset[0].ModuloId;
  await registrarAuditoria({ tabela: "TrilhaModulos", registroId: moduloId, acao: "MODULO_CRIADO", usuarioId: criadoPorMembroId, dadosAntes: null, dadosDepois: { trilhaId, ...d, ordem: ordemFinal } });
  return { sucesso: true, moduloId, ordem: ordemFinal, mensagem: "✅ Módulo adicionado." };
}

// Desativar (nunca apagar): conclusões antigas continuam apontando pro módulo.
// Um módulo desativado sai do cálculo de progresso dali pra frente.
async function atualizarModulo(pool, { moduloId, ativo, obrigatorio, cargaHoraria, atualizadoPorMembroId }) {
  const modulo = await buscarModulo(pool, moduloId);
  if (!modulo) return { sucesso: false, mensagem: "Módulo não encontrado." };
  const carga = cargaHoraria === undefined ? modulo.cargaHoraria : Number(cargaHoraria);
  if (Number.isNaN(carga) || carga < 0 || carga > 999) return { sucesso: false, mensagem: "A carga horária deve estar entre 0 e 999 horas." };
  await pool.request()
    .input("id", sql.Int, moduloId).input("ativo", sql.Bit, ativo === undefined ? modulo.ativo : !!ativo)
    .input("obrig", sql.Bit, obrigatorio === undefined ? modulo.obrigatorio : !!obrigatorio).input("carga", sql.Decimal(5, 1), arred1(carga))
    .query(`UPDATE TrilhaModulos SET Ativo = @ativo, Obrigatorio = @obrig, CargaHoraria = @carga WHERE ModuloId = @id`);
  await registrarAuditoria({
    tabela: "TrilhaModulos", registroId: moduloId, acao: "MODULO_ATUALIZADO", usuarioId: atualizadoPorMembroId,
    dadosAntes: { ativo: modulo.ativo, obrigatorio: modulo.obrigatorio, cargaHoraria: modulo.cargaHoraria },
    dadosDepois: { ativo: ativo === undefined ? modulo.ativo : !!ativo, obrigatorio: obrigatorio === undefined ? modulo.obrigatorio : !!obrigatorio, cargaHoraria: arred1(carga) }
  });
  return { sucesso: true, mensagem: "✅ Módulo atualizado." };
}

async function adicionarPreRequisitoModulo(pool, { moduloId, preRequisitoModuloId, registradoPorMembroId }) {
  const [modulo, pre] = await Promise.all([buscarModulo(pool, moduloId), buscarModulo(pool, preRequisitoModuloId)]);
  const validacao = validarPreRequisitoModulo(modulo, pre);
  if (!validacao.valido) return { sucesso: false, mensagem: validacao.mensagem };
  const ja = await pool.request().input("m", sql.Int, moduloId).input("p", sql.Int, preRequisitoModuloId)
    .query(`SELECT 1 AS ok FROM TrilhaModuloPreRequisitos WHERE ModuloId = @m AND PreRequisitoModuloId = @p`);
  if (ja.recordset.length > 0) return { sucesso: false, mensagem: "Este pré-requisito já existe." };
  await pool.request().input("m", sql.Int, moduloId).input("p", sql.Int, preRequisitoModuloId)
    .query(`INSERT INTO TrilhaModuloPreRequisitos (ModuloId, PreRequisitoModuloId) VALUES (@m, @p)`);
  await registrarAuditoria({ tabela: "TrilhaModuloPreRequisitos", registroId: moduloId, acao: "PREREQUISITO_MODULO_ADICIONADO", usuarioId: registradoPorMembroId, dadosAntes: null, dadosDepois: { moduloId, preRequisitoModuloId } });
  return { sucesso: true, mensagem: "✅ Pré-requisito de módulo adicionado." };
}

async function adicionarPreRequisitoTrilha(pool, { trilhaId, preRequisitoTrilhaId, registradoPorMembroId }) {
  const trilhas = await pool.request().input("a", sql.Int, trilhaId).input("b", sql.Int, preRequisitoTrilhaId).query(`SELECT TrilhaId FROM Trilhas WHERE TrilhaId IN (@a, @b)`);
  const achadas = new Set(trilhas.recordset.map(r => r.TrilhaId));
  if (!achadas.has(Number(trilhaId)) || !achadas.has(Number(preRequisitoTrilhaId))) return { sucesso: false, mensagem: "Trilha não encontrada." };
  const arestas = (await pool.request().query(`SELECT TrilhaId AS trilhaId, PreRequisitoTrilhaId AS preRequisitoTrilhaId FROM TrilhaPreRequisitos`)).recordset;
  if (arestas.some(a => a.trilhaId === Number(trilhaId) && a.preRequisitoTrilhaId === Number(preRequisitoTrilhaId))) return { sucesso: false, mensagem: "Este pré-requisito já existe." };
  if (criariaCicloTrilhas(arestas, Number(trilhaId), Number(preRequisitoTrilhaId))) {
    return { sucesso: false, mensagem: "Este pré-requisito criaria um ciclo entre trilhas (uma exigiria a outra, direta ou indiretamente)." };
  }
  await pool.request().input("t", sql.Int, trilhaId).input("p", sql.Int, preRequisitoTrilhaId).query(`INSERT INTO TrilhaPreRequisitos (TrilhaId, PreRequisitoTrilhaId) VALUES (@t, @p)`);
  await registrarAuditoria({ tabela: "TrilhaPreRequisitos", registroId: trilhaId, acao: "PREREQUISITO_TRILHA_ADICIONADO", usuarioId: registradoPorMembroId, dadosAntes: null, dadosDepois: { trilhaId, preRequisitoTrilhaId } });
  return { sucesso: true, mensagem: "✅ Pré-requisito de trilha adicionado." };
}

async function removerPreRequisitoTrilha(pool, { trilhaId, preRequisitoTrilhaId, registradoPorMembroId }) {
  const r = await pool.request().input("t", sql.Int, trilhaId).input("p", sql.Int, preRequisitoTrilhaId)
    .query(`DELETE FROM TrilhaPreRequisitos WHERE TrilhaId = @t AND PreRequisitoTrilhaId = @p`);
  if (!r.rowsAffected[0]) return { sucesso: false, mensagem: "Este pré-requisito não existe." };
  await registrarAuditoria({ tabela: "TrilhaPreRequisitos", registroId: trilhaId, acao: "PREREQUISITO_TRILHA_REMOVIDO", usuarioId: registradoPorMembroId, dadosAntes: { trilhaId, preRequisitoTrilhaId }, dadosDepois: null });
  return { sucesso: true, mensagem: "✅ Pré-requisito de trilha removido." };
}

async function listarTrilhas(pool, { apenasAtivas = false } = {}) {
  const trilhas = (await pool.request().query(`SELECT * FROM Trilhas ${apenasAtivas ? "WHERE Ativa = 1" : ""} ORDER BY Nome`)).recordset;
  if (!trilhas.length) return [];
  const [modulos, preMod, preTri] = await Promise.all([
    pool.request().query(`SELECT * FROM TrilhaModulos ORDER BY TrilhaId, Ordem, ModuloId`),
    pool.request().query(`SELECT ModuloId AS moduloId, PreRequisitoModuloId AS preRequisitoModuloId FROM TrilhaModuloPreRequisitos`),
    pool.request().query(`SELECT TrilhaId AS trilhaId, PreRequisitoTrilhaId AS preRequisitoTrilhaId FROM TrilhaPreRequisitos`)
  ]);
  return trilhas.map(t => {
    const mods = modulos.recordset.filter(m => m.TrilhaId === t.TrilhaId).map(mapearModulo);
    return {
      trilhaId: t.TrilhaId, nome: t.Nome, descricao: t.Descricao, papelAlvo: t.PapelAlvo, validadeMeses: t.ValidadeMeses,
      avisoDias: t.AvisoDias, ativa: !!t.Ativa,
      modulos: mods.map(m => ({ ...m, preRequisitos: preMod.recordset.filter(p => p.moduloId === m.moduloId).map(p => p.preRequisitoModuloId) })),
      preRequisitosTrilha: preTri.recordset.filter(p => p.trilhaId === t.TrilhaId).map(p => p.preRequisitoTrilhaId)
    };
  });
}

// ---- Matrículas e situação ----

// Matrículas (com trilha, certificado e contagem de obrigatórios) de vários
// membros de uma vez, já com a situação calculada. Chave: "membroId|trilhaId".
async function carregarSituacoes(pool, { membroIds, trilhaIds, hojeIso = hojeIsoLocal() }) {
  const mapa = new Map();
  const membros = [...new Set((membroIds || []).map(Number))].filter(Boolean);
  if (!membros.length) return mapa;
  if (membros.length > LIMITE_LISTA_SQL) throw new Error(`carregarSituacoes: mais de ${LIMITE_LISTA_SQL} membros de uma vez.`);

  const request = pool.request();
  let filtroTrilha = "";
  if (trilhaIds && trilhaIds.length) filtroTrilha = ` AND m.TrilhaId IN (${listaParametros(request, "t", [...new Set(trilhaIds.map(Number))], sql.Int)})`;
  const result = await request.query(`
    SELECT m.MatriculaId, m.TrilhaId, m.MembroId, m.Status, m.IniciadaEm, m.ConcluidaEm, m.ValidoAte,
           t.Nome AS TrilhaNome, t.PapelAlvo, t.AvisoDias,
           c.CertificadoId, c.CodigoVerificacao, c.Protocolo, c.RevogadoEm,
           (SELECT COUNT(*) FROM TrilhaModuloConclusoes x JOIN TrilhaModulos mm ON mm.ModuloId = x.ModuloId
             WHERE x.MatriculaId = m.MatriculaId AND mm.Ativo = 1 AND mm.Obrigatorio = 1) AS ObrigConcluidos,
           (SELECT COUNT(*) FROM TrilhaModulos mm WHERE mm.TrilhaId = m.TrilhaId AND mm.Ativo = 1 AND mm.Obrigatorio = 1) AS ObrigTotal
    FROM TrilhaMatriculas m
    JOIN Trilhas t ON t.TrilhaId = m.TrilhaId
    OUTER APPLY (SELECT TOP 1 CertificadoId, CodigoVerificacao, Protocolo, RevogadoEm FROM CertificadosEmitidos WHERE TrilhaMatriculaId = m.MatriculaId ORDER BY CertificadoId DESC) c
    WHERE m.MembroId IN (${listaParametros(request, "m", membros, sql.Int)})${filtroTrilha}
    ORDER BY m.MatriculaId DESC
  `);

  for (const r of result.recordset) {
    const validoAte = r.ValidoAte ? certificados.isoDia(r.ValidoAte) : null;
    const sit = situacaoFormacao({ status: r.Status, validoAte, avisoDias: r.AvisoDias, revogada: !!r.RevogadoEm }, hojeIso);
    const item = {
      matriculaId: r.MatriculaId, trilhaId: r.TrilhaId, membroId: r.MembroId, trilhaNome: r.TrilhaNome, papelAlvo: r.PapelAlvo,
      status: r.Status, situacao: sit.situacao, diasParaVencer: sit.diasParaVencer,
      iniciadaEm: r.IniciadaEm, concluidaEm: r.ConcluidaEm, validoAte,
      obrigatoriosConcluidos: r.ObrigConcluidos, obrigatoriosTotal: r.ObrigTotal,
      certificado: r.CertificadoId ? { certificadoId: r.CertificadoId, codigoVerificacao: certificados.formatarCodigo(r.CodigoVerificacao), protocolo: r.Protocolo, revogadoEm: r.RevogadoEm || null } : null
    };
    const chave = `${r.MembroId}|${r.TrilhaId}`;
    if (!mapa.has(chave)) mapa.set(chave, []);
    mapa.get(chave).push(item);
  }
  return mapa;
}

async function listarFormacaoDoMembro(pool, membroId, hojeIso = hojeIsoLocal()) {
  const mapa = await carregarSituacoes(pool, { membroIds: [membroId], hojeIso });
  const todas = [];
  for (const lista of mapa.values()) todas.push(...lista);
  return todas.sort((a, b) => b.matriculaId - a.matriculaId);
}

async function buscarMatricula(pool, matriculaId, hojeIso = hojeIsoLocal()) {
  const r = await pool.request().input("id", sql.Int, matriculaId).query(`SELECT * FROM TrilhaMatriculas WHERE MatriculaId = @id`);
  const m = r.recordset[0];
  if (!m) return null;
  const [modulos, preReq, conclusoes, trilha, mapa] = await Promise.all([
    pool.request().input("t", sql.Int, m.TrilhaId).query(`SELECT * FROM TrilhaModulos WHERE TrilhaId = @t`),
    pool.request().input("t", sql.Int, m.TrilhaId).query(`
      SELECT p.ModuloId AS moduloId, p.PreRequisitoModuloId AS preRequisitoModuloId
      FROM TrilhaModuloPreRequisitos p JOIN TrilhaModulos mm ON mm.ModuloId = p.ModuloId WHERE mm.TrilhaId = @t`),
    pool.request().input("id", sql.Int, matriculaId).query(`SELECT ModuloId AS moduloId, CargaHorariaRegistrada AS cargaHorariaRegistrada, ConcluidoEm AS concluidoEm, Observacao AS observacao FROM TrilhaModuloConclusoes WHERE MatriculaId = @id`),
    pool.request().input("t", sql.Int, m.TrilhaId).query(`SELECT * FROM Trilhas WHERE TrilhaId = @t`),
    carregarSituacoes(pool, { membroIds: [m.MembroId], trilhaIds: [m.TrilhaId], hojeIso })
  ]);
  const progresso = calcularProgresso({ modulos: modulos.recordset.map(mapearModulo), preRequisitos: preReq.recordset, conclusoes: conclusoes.recordset });
  const situacao = (mapa.get(`${m.MembroId}|${m.TrilhaId}`) || []).find(x => x.matriculaId === matriculaId) || null;
  return {
    matriculaId: m.MatriculaId, trilhaId: m.TrilhaId, membroId: m.MembroId, status: m.Status,
    trilha: { trilhaId: trilha.recordset[0].TrilhaId, nome: trilha.recordset[0].Nome, validadeMeses: trilha.recordset[0].ValidadeMeses },
    iniciadaEm: m.IniciadaEm, concluidaEm: m.ConcluidaEm, validoAte: m.ValidoAte ? certificados.isoDia(m.ValidoAte) : null,
    situacao: situacao ? situacao.situacao : null, certificado: situacao ? situacao.certificado : null,
    progresso, conclusoes: conclusoes.recordset
  };
}

async function matricular(pool, { trilhaId, membroId, registradoPorMembroId, hojeIso = hojeIsoLocal() }) {
  const trilha = (await pool.request().input("id", sql.Int, trilhaId).query(`SELECT * FROM Trilhas WHERE TrilhaId = @id`)).recordset[0];
  if (!trilha) return { sucesso: false, mensagem: "Trilha não encontrada." };
  if (!trilha.Ativa) return { sucesso: false, mensagem: "Esta trilha está desativada." };

  const obrig = await pool.request().input("t", sql.Int, trilhaId).query(`SELECT COUNT(*) AS Total FROM TrilhaModulos WHERE TrilhaId = @t AND Ativo = 1 AND Obrigatorio = 1`);
  if (obrig.recordset[0].Total === 0) return { sucesso: false, mensagem: "Esta trilha ainda não tem módulo obrigatório — cadastre os módulos antes de matricular alguém." };

  const membro = await pool.request().input("id", sql.Int, membroId).query(`SELECT MembroId FROM MembroReferencia WHERE MembroId = @id`);
  if (membro.recordset.length === 0) return { sucesso: false, mensagem: "Membro não encontrado." };

  const preTrilhas = (await pool.request().input("t", sql.Int, trilhaId).query(`
    SELECT p.PreRequisitoTrilhaId AS id, t.Nome FROM TrilhaPreRequisitos p JOIN Trilhas t ON t.TrilhaId = p.PreRequisitoTrilhaId WHERE p.TrilhaId = @t`)).recordset;
  const mapa = await carregarSituacoes(pool, { membroIds: [membroId], trilhaIds: [trilhaId, ...preTrilhas.map(p => p.id)], hojeIso });

  const proprias = mapa.get(`${membroId}|${trilhaId}`) || [];
  if (proprias.some(m => m.situacao === "EM_ANDAMENTO")) return { sucesso: false, mensagem: "Esta pessoa já tem uma matrícula em andamento nesta trilha." };
  const vigente = proprias.find(m => m.situacao === "VIGENTE");
  if (vigente) return { sucesso: false, mensagem: `Esta pessoa já concluiu esta trilha e o certificado está vigente${vigente.validoAte ? ` até ${formatarDataBr(vigente.validoAte)}` : ""}.` };

  for (const pre of preTrilhas) {
    const melhor = escolherMelhor(mapa.get(`${membroId}|${pre.id}`) || []);
    if (!melhor || !["VIGENTE", "VENCENDO"].includes(melhor.situacao)) {
      return { sucesso: false, mensagem: `Antes é preciso concluir a trilha "${pre.Nome}" (pré-requisito).` };
    }
  }

  const result = await pool.request().input("t", sql.Int, trilhaId).input("m", sql.Int, membroId).input("por", sql.Int, registradoPorMembroId || null)
    .query(`INSERT INTO TrilhaMatriculas (TrilhaId, MembroId, RegistradaPorMembroId) OUTPUT INSERTED.MatriculaId VALUES (@t, @m, @por)`);
  const matriculaId = result.recordset[0].MatriculaId;
  await registrarAuditoria({ tabela: "TrilhaMatriculas", registroId: matriculaId, acao: "TRILHA_MATRICULADO", usuarioId: registradoPorMembroId, dadosAntes: null, dadosDepois: { trilhaId, membroId } });
  return { sucesso: true, matriculaId, mensagem: `✅ Matrícula na trilha "${trilha.Nome}" criada.` };
}

async function cancelarMatricula(pool, { matriculaId, motivo, registradoPorMembroId }) {
  const m = (await pool.request().input("id", sql.Int, matriculaId).query(`SELECT * FROM TrilhaMatriculas WHERE MatriculaId = @id`)).recordset[0];
  if (!m) return { sucesso: false, mensagem: "Matrícula não encontrada." };
  if (m.Status !== STATUS_MATRICULA.EM_ANDAMENTO) return { sucesso: false, mensagem: "Só é possível cancelar uma matrícula em andamento (certificado emitido se revoga, não se cancela)." };
  if (!limpar(motivo) || limpar(motivo).length < 5) return { sucesso: false, mensagem: "Informe o motivo do cancelamento (mínimo 5 caracteres)." };
  await pool.request().input("id", sql.Int, matriculaId).input("motivo", sql.NVarChar(300), limpar(motivo).slice(0, 300))
    .query(`UPDATE TrilhaMatriculas SET Status = 'CANCELADA', CanceladaEm = SYSUTCDATETIME(), MotivoCancelamento = @motivo, AtualizadoEm = SYSUTCDATETIME() WHERE MatriculaId = @id`);
  await registrarAuditoria({ tabela: "TrilhaMatriculas", registroId: matriculaId, acao: "TRILHA_MATRICULA_CANCELADA", usuarioId: registradoPorMembroId, dadosAntes: { status: m.Status }, dadosDepois: { status: "CANCELADA" } });
  return { sucesso: true, mensagem: "✅ Matrícula cancelada." };
}

// Emite o certificado de uma matrícula JÁ concluída que ainda não tem um
// (idempotente: se existe, devolve o existente). É o reparo da única janela
// de falha da conclusão — a matrícula ser marcada CONCLUIDA e a emissão
// falhar logo depois.
async function garantirCertificadoDaMatricula(pool, { matriculaId, emitidoPorMembroId }) {
  const m = (await pool.request().input("id", sql.Int, matriculaId).query(`
    SELECT m.*, t.Nome AS TrilhaNome FROM TrilhaMatriculas m JOIN Trilhas t ON t.TrilhaId = m.TrilhaId WHERE m.MatriculaId = @id`)).recordset[0];
  if (!m) return { sucesso: false, mensagem: "Matrícula não encontrada." };
  if (m.Status !== STATUS_MATRICULA.CONCLUIDA) return { sucesso: false, mensagem: "A matrícula ainda não foi concluída." };

  const existente = await pool.request().input("id", sql.Int, matriculaId).query(`SELECT TOP 1 CertificadoId, CodigoVerificacao FROM CertificadosEmitidos WHERE TrilhaMatriculaId = @id ORDER BY CertificadoId`);
  if (existente.recordset[0]) {
    return { sucesso: true, jaExistia: true, certificadoId: existente.recordset[0].CertificadoId, codigoVerificacao: certificados.formatarCodigo(existente.recordset[0].CodigoVerificacao), mensagem: "Certificado já emitido." };
  }

  const modulos = (await pool.request().input("id", sql.Int, matriculaId).query(`
    SELECT mm.Titulo, c.CargaHorariaRegistrada FROM TrilhaModuloConclusoes c JOIN TrilhaModulos mm ON mm.ModuloId = c.ModuloId WHERE c.MatriculaId = @id ORDER BY mm.Ordem`)).recordset;
  const horas = arred1(modulos.reduce((s, x) => s + Number(x.CargaHorariaRegistrada), 0));
  const concluidaEm = certificados.isoDia(m.ConcluidaEm);
  let descricao = `Trilha de formação concluída em ${formatarDataBr(concluidaEm)}. Carga horária: ${horas}h. Módulos: ${modulos.map(x => x.Titulo).join("; ")}.`;
  if (descricao.length > 600) descricao = descricao.slice(0, 597) + "...";

  const emissao = await certificados.emitirCertificado(pool, {
    membroId: m.MembroId, titulo: `Conclusão da trilha "${m.TrilhaNome.slice(0, 110)}"`, descricao,
    emitidoPorMembroId, validoAte: m.ValidoAte ? certificados.isoDia(m.ValidoAte) : null, trilhaMatriculaId: matriculaId
  });
  return emissao;
}

// Conclui um módulo. Se era o último obrigatório, a matrícula se conclui
// SOZINHA (status, data, validade calculada da trilha) e o certificado é
// emitido. Quem "ganha a corrida" é o UPDATE condicional (`Status =
// 'EM_ANDAMENTO'`): duas conclusões simultâneas do último módulo emitem UM
// certificado só.
async function concluirModulo(pool, { matriculaId, moduloId, dataConclusao, observacao, registradoPorMembroId, hojeIso = hojeIsoLocal() }) {
  const matricula = await buscarMatricula(pool, matriculaId, hojeIso);
  if (!matricula) return { sucesso: false, mensagem: "Matrícula não encontrada." };

  // Retentativa depois de uma falha na emissão: módulo já concluído e
  // matrícula concluída sem certificado -> só completa o que faltou.
  if (matricula.status === STATUS_MATRICULA.CONCLUIDA && !matricula.certificado) {
    const reparo = await garantirCertificadoDaMatricula(pool, { matriculaId, emitidoPorMembroId: registradoPorMembroId });
    if (reparo.sucesso) return { sucesso: true, matriculaConcluida: true, certificadoId: reparo.certificadoId, codigoVerificacao: reparo.codigoVerificacao, mensagem: "✅ Certificado emitido." };
  }

  const validacaoData = validarDataConclusaoModulo(dataConclusao, hojeIso);
  if (!validacaoData.valido) return { sucesso: false, mensagem: validacaoData.mensagem };
  const decisao = podeConcluirModulo({ matricula: { status: matricula.status }, progresso: matricula.progresso, moduloId });
  if (!decisao.permitido) return { sucesso: false, mensagem: decisao.mensagem };

  const modulo = matricula.progresso.modulos.find(m => m.moduloId === Number(moduloId));
  try {
    await pool.request()
      .input("m", sql.Int, matriculaId).input("mod", sql.Int, moduloId).input("data", sql.Date, validacaoData.data)
      .input("carga", sql.Decimal(5, 1), modulo.cargaHoraria).input("obs", sql.NVarChar(300), limpar(observacao).slice(0, 300) || null)
      .input("por", sql.Int, registradoPorMembroId || null)
      .query(`INSERT INTO TrilhaModuloConclusoes (MatriculaId, ModuloId, ConcluidoEm, CargaHorariaRegistrada, Observacao, RegistradoPorMembroId) VALUES (@m, @mod, @data, @carga, @obs, @por)`);
  } catch (e) {
    // Duas requisições registrando o mesmo módulo ao mesmo tempo: a UNIQUE
    // (MatriculaId, ModuloId) deixa passar uma só.
    if (e && (e.number === 2627 || e.number === 2601)) return { sucesso: false, mensagem: "Este módulo já foi concluído." };
    throw e;
  }
  await registrarAuditoria({ tabela: "TrilhaModuloConclusoes", registroId: matriculaId, acao: "MODULO_CONCLUIDO", usuarioId: registradoPorMembroId, dadosAntes: null, dadosDepois: { matriculaId, moduloId: Number(moduloId) } });

  const depois = await buscarMatricula(pool, matriculaId, hojeIso);
  if (!depois.progresso.completa) {
    return { sucesso: true, matriculaConcluida: false, progresso: depois.progresso, mensagem: `✅ Módulo "${modulo.titulo}" concluído (${depois.progresso.obrigatoriosConcluidos}/${depois.progresso.obrigatoriosTotal}).` };
  }

  // Trava 6-B: a trilha se conclui na data do último módulo OBRIGATÓRIO
  // concluído — não no dia em que alguém registrou. Antes, um módulo lançado
  // com data retroativa (curso feito em março, registrado em setembro) dava
  // validade contada a partir de setembro: meses de certificado a mais.
  const ultima = (await pool.request().input("m", sql.Int, matriculaId).query(`
    SELECT MAX(c.ConcluidoEm) AS Ultima FROM TrilhaModuloConclusoes c JOIN TrilhaModulos mm ON mm.ModuloId = c.ModuloId
    WHERE c.MatriculaId = @m AND mm.Obrigatorio = 1 AND mm.Ativo = 1`)).recordset[0];
  const concluidaIso = (ultima && certificados.isoDia(ultima.Ultima)) || hojeIso;
  const validoAte = calcularValidade(concluidaIso, depois.trilha.validadeMeses);
  const ganhou = await pool.request().input("id", sql.Int, matriculaId).input("validoAte", sql.Date, validoAte).input("concluida", sql.Date, concluidaIso)
    .query(`UPDATE TrilhaMatriculas SET Status = 'CONCLUIDA', ConcluidaEm = @concluida, ValidoAte = @validoAte, AtualizadoEm = SYSUTCDATETIME() WHERE MatriculaId = @id AND Status = 'EM_ANDAMENTO'`);
  if (!ganhou.rowsAffected[0]) return { sucesso: true, matriculaConcluida: true, mensagem: "✅ Módulo concluído (a matrícula já havia sido concluída por outra requisição)." };

  await registrarAuditoria({ tabela: "TrilhaMatriculas", registroId: matriculaId, acao: "TRILHA_CONCLUIDA", usuarioId: registradoPorMembroId, dadosAntes: { status: "EM_ANDAMENTO" }, dadosDepois: { status: "CONCLUIDA", validoAte } });

  const emissao = await garantirCertificadoDaMatricula(pool, { matriculaId, emitidoPorMembroId: registradoPorMembroId });
  if (!emissao.sucesso) {
    return { sucesso: true, matriculaConcluida: true, avisoCertificado: emissao.mensagem, mensagem: `✅ Trilha concluída, mas o certificado não foi emitido (${emissao.mensagem}). Use "emitir certificado" para tentar de novo.` };
  }
  return {
    sucesso: true, matriculaConcluida: true, certificadoId: emissao.certificadoId, codigoVerificacao: emissao.codigoVerificacao, validoAte,
    mensagem: `🎓 Trilha concluída! Certificado emitido${validoAte ? `, válido até ${formatarDataBr(validoAte)}` : ""}.`
  };
}

// ---- Requisitos ----

async function criarRequisito(pool, { contexto, alvoChave, trilhaId, modo, criadoPorMembroId }) {
  const validacao = validarRequisito({ contexto, alvoChave, trilhaId, modo });
  if (!validacao.valido) return { sucesso: false, mensagem: validacao.mensagem };
  const d = validacao.dados;
  const trilha = await pool.request().input("id", sql.Int, d.trilhaId).query(`SELECT TrilhaId FROM Trilhas WHERE TrilhaId = @id`);
  if (trilha.recordset.length === 0) return { sucesso: false, mensagem: "Trilha não encontrada." };

  const existente = await pool.request().input("c", sql.NVarChar(30), d.contexto).input("a", sql.NVarChar(100), d.alvoChave).input("t", sql.Int, d.trilhaId)
    .query(`SELECT RequisitoId FROM TrilhaRequisitos WHERE Contexto = @c AND AlvoChave = @a AND TrilhaId = @t`);
  let requisitoId;
  if (existente.recordset[0]) {
    requisitoId = existente.recordset[0].RequisitoId; // reativa/atualiza o modo em vez de duplicar
    await pool.request().input("id", sql.Int, requisitoId).input("modo", sql.NVarChar(10), d.modo).query(`UPDATE TrilhaRequisitos SET Ativo = 1, Modo = @modo WHERE RequisitoId = @id`);
  } else {
    const r = await pool.request().input("c", sql.NVarChar(30), d.contexto).input("a", sql.NVarChar(100), d.alvoChave).input("t", sql.Int, d.trilhaId)
      .input("modo", sql.NVarChar(10), d.modo).input("por", sql.Int, criadoPorMembroId || null)
      .query(`INSERT INTO TrilhaRequisitos (Contexto, AlvoChave, TrilhaId, Modo, CriadoPorMembroId) OUTPUT INSERTED.RequisitoId VALUES (@c, @a, @t, @modo, @por)`);
    requisitoId = r.recordset[0].RequisitoId;
  }
  await registrarAuditoria({ tabela: "TrilhaRequisitos", registroId: requisitoId, acao: "REQUISITO_DEFINIDO", usuarioId: criadoPorMembroId, dadosAntes: null, dadosDepois: d });
  return { sucesso: true, requisitoId, mensagem: `✅ Requisito definido (${ROTULO_CONTEXTO[d.contexto]} — ${d.modo === "BLOQUEIA" ? "bloqueia" : "só alerta"}).` };
}

async function removerRequisito(pool, { requisitoId, removidoPorMembroId }) {
  const r = await pool.request().input("id", sql.Int, requisitoId).query(`UPDATE TrilhaRequisitos SET Ativo = 0 WHERE RequisitoId = @id AND Ativo = 1`);
  if (!r.rowsAffected[0]) return { sucesso: false, mensagem: "Requisito não encontrado (ou já removido)." };
  await registrarAuditoria({ tabela: "TrilhaRequisitos", registroId: requisitoId, acao: "REQUISITO_REMOVIDO", usuarioId: removidoPorMembroId, dadosAntes: { ativo: true }, dadosDepois: { ativo: false } });
  return { sucesso: true, mensagem: "✅ Requisito removido." };
}

async function listarRequisitos(pool, { contexto, apenasAtivos = true } = {}) {
  const request = pool.request();
  const cond = [];
  if (apenasAtivos) cond.push("r.Ativo = 1");
  if (contexto) { request.input("c", sql.NVarChar(30), contexto); cond.push("r.Contexto = @c"); }
  const result = await request.query(`
    SELECT r.RequisitoId, r.Contexto, r.AlvoChave, r.TrilhaId, r.Modo, r.Ativo, t.Nome AS TrilhaNome, t.Ativa AS TrilhaAtiva
    FROM TrilhaRequisitos r JOIN Trilhas t ON t.TrilhaId = r.TrilhaId
    ${cond.length ? "WHERE " + cond.join(" AND ") : ""}
    ORDER BY r.Contexto, r.AlvoChave, t.Nome
  `);
  return result.recordset.map(r => ({
    requisitoId: r.RequisitoId, contexto: r.Contexto, contextoRotulo: ROTULO_CONTEXTO[r.Contexto], alvoChave: r.AlvoChave,
    trilhaId: r.TrilhaId, trilhaNome: r.TrilhaNome, trilhaAtiva: !!r.TrilhaAtiva, modo: r.Modo, ativo: !!r.Ativo
  }));
}

// O ponto de integração de todos os fluxos: "esta pessoa cumpre a formação
// exigida aqui?". Sem requisito configurado, devolve temRequisitos:false e o
// fluxo segue exatamente como antes.
async function avaliarRequisitos(pool, { contexto, alvoChave = "", membroId, hojeIso = hojeIsoLocal() }) {
  const reqs = await listarRequisitos(pool, { contexto });
  const aplicaveis = reqs.filter(r => alvoCorresponde(r.alvoChave, alvoChave));
  if (!aplicaveis.length) return resumirRequisitos([]);
  const mapa = await carregarSituacoes(pool, { membroIds: [membroId], trilhaIds: aplicaveis.map(r => r.trilhaId), hojeIso });
  return resumirRequisitos(aplicaveis.map(r => avaliarRequisito({ requisito: r, melhor: escolherMelhor(mapa.get(`${membroId}|${r.trilhaId}`) || []) })));
}

// Versão em lote (escala: toda a equipe de uma vez). `bloqueados` traz o
// motivo de quem NÃO pode ser escalado; quem só tem ALERTA continua elegível.
async function filtrarMembrosQueAtendem(pool, { contexto, alvoChave = "", membroIds, hojeIso = hojeIsoLocal() }) {
  const ids = [...new Set((membroIds || []).map(Number))].filter(Boolean);
  const reqs = (await listarRequisitos(pool, { contexto })).filter(r => alvoCorresponde(r.alvoChave, alvoChave));
  if (!reqs.length || !ids.length) return { temRequisitos: reqs.length > 0, atendem: new Set(ids), bloqueados: new Map() };

  const mapa = await carregarSituacoes(pool, { membroIds: ids, trilhaIds: reqs.map(r => r.trilhaId), hojeIso });
  const atendem = new Set();
  const bloqueados = new Map();
  for (const id of ids) {
    const resumo = resumirRequisitos(reqs.map(r => avaliarRequisito({ requisito: r, melhor: escolherMelhor(mapa.get(`${id}|${r.trilhaId}`) || []) })));
    if (resumo.bloqueado) bloqueados.set(id, resumo.mensagemBloqueio); else atendem.add(id);
  }
  return { temRequisitos: true, atendem, bloqueados };
}

// ---- Pendências de validade (educação continuada) ----

// Certificados vencidos ou dentro da janela de aviso, um por (trilha, membro)
// — o mais recente concluído. `nomesCongregacoesPermitidas`: null = tudo.
async function listarPendenciasVencimento(pool, { nomesCongregacoesPermitidas = null, congregacaoId = null, hojeIso = hojeIsoLocal() } = {}) {
  const request = pool.request().input("hoje", sql.Date, hojeIso);
  let escopo = "";
  if (congregacaoId) { request.input("cong", sql.Int, congregacaoId); escopo += " AND mem.CongregacaoId = @cong"; }
  if (Array.isArray(nomesCongregacoesPermitidas)) {
    if (!nomesCongregacoesPermitidas.length) return [];
    escopo += ` AND cg.Nome IN (${listaParametros(request, "n", nomesCongregacoesPermitidas, sql.NVarChar(150))})`;
  }
  const result = await request.query(`
    SELECT m.MatriculaId, m.MembroId, mem.Nome AS MembroNome, cg.Nome AS CongregacaoNome, ext.Nome AS ExtensaoNome, t.TrilhaId, t.Nome AS TrilhaNome, t.AvisoDias,
           m.ConcluidaEm, m.ValidoAte,
           (SELECT COUNT(*) FROM TrilhaMatriculas r WHERE r.TrilhaId = m.TrilhaId AND r.MembroId = m.MembroId AND r.Status = 'EM_ANDAMENTO') AS RenovacaoEmAndamento
    FROM TrilhaMatriculas m
    JOIN Trilhas t ON t.TrilhaId = m.TrilhaId
    JOIN MembroReferencia mem ON mem.MembroId = m.MembroId
    LEFT JOIN Congregacoes cg ON cg.CongregacaoId = mem.CongregacaoId
    LEFT JOIN ExtensoesTenda ext ON ext.ExtensaoId = mem.ExtensaoId
    OUTER APPLY (SELECT TOP 1 RevogadoEm FROM CertificadosEmitidos WHERE TrilhaMatriculaId = m.MatriculaId ORDER BY CertificadoId DESC) c
    WHERE m.Status = 'CONCLUIDA' AND m.ValidoAte IS NOT NULL AND c.RevogadoEm IS NULL
      AND m.ValidoAte <= DATEADD(DAY, t.AvisoDias, @hoje)
      AND NOT EXISTS (SELECT 1 FROM TrilhaMatriculas n WHERE n.TrilhaId = m.TrilhaId AND n.MembroId = m.MembroId AND n.Status = 'CONCLUIDA' AND n.MatriculaId > m.MatriculaId)
      ${escopo}
    ORDER BY m.ValidoAte, mem.Nome
  `);
  return result.recordset.map(r => {
    const validoAte = certificados.isoDia(r.ValidoAte);
    const sit = situacaoFormacao({ status: "CONCLUIDA", validoAte, avisoDias: r.AvisoDias }, hojeIso);
    return {
      matriculaId: r.MatriculaId, membroId: r.MembroId, membroNome: r.MembroNome, congregacaoNome: r.CongregacaoNome || null, extensaoNome: r.ExtensaoNome || null,
      trilhaId: r.TrilhaId, trilhaNome: r.TrilhaNome, validoAte, situacao: sit.situacao, diasParaVencer: sit.diasParaVencer,
      renovacaoEmAndamento: r.RenovacaoEmAndamento > 0
    };
  });
}

module.exports = {
  CONTEXTOS, CONTEXTOS_COM_ALVO, MODOS, ROTULO_CONTEXTO, STATUS_MATRICULA, RANK_SITUACAO,
  // Lógica pura
  dataIsoValida, calcularValidade, diasAte, formatarDataBr,
  validarNovaTrilha, validarNovoModulo, validarPreRequisitoModulo, criariaCicloTrilhas,
  calcularProgresso, podeConcluirModulo, validarDataConclusaoModulo,
  situacaoFormacao, escolherMelhor,
  validarRequisito, avaliarRequisito, resumirRequisitos, normalizarAlvo, alvoCorresponde,
  // Banco
  criarTrilha, atualizarTrilha, adicionarModulo, atualizarModulo, adicionarPreRequisitoModulo, adicionarPreRequisitoTrilha, removerPreRequisitoTrilha,
  listarTrilhas, carregarSituacoes, listarFormacaoDoMembro, buscarMatricula, matricular, cancelarMatricula,
  garantirCertificadoDaMatricula, concluirModulo,
  criarRequisito, removerRequisito, listarRequisitos, avaliarRequisitos, filtrarMembrosQueAtendem,
  listarPendenciasVencimento
};
