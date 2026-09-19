// shared/conquistas.js (v6.4 — Motor de conquistas e gamificação)
//
// Diferente do resto da FASE 6, este módulo NÃO conhece EBD. É um motor
// genérico de conquistas/regras/pontuação — mesmo espírito de
// shared/estatuto.js / shared/parentesco.js: escrito uma vez, reaproveitado
// por módulos futuros (Reuniões, Escala de Serviço, Contribuição — ainda
// não implementados, só o registro do tipo de evento é o suficiente pra
// eles existirem um dia sem tocar neste arquivo).
//
// A ÚNICA fonte de verdade que o motor lê é ConquistasEventos (log
// genérico de ocorrências: MembroId + TipoEvento + PayloadJson + data) —
// nunca uma tabela de outro módulo (ex: EbdChamadas) diretamente. Quem
// gera o evento (hoje, shared/ebdChamada.js e shared/ebdAtividades.js)
// decide o que entra no payload; o motor só sabe comparar chaves/valores
// desse payload contra a config de cada regra.
//
// Os 5 tipos de regra (item 1 do checklist) são avaliados por 5 funções
// PURAS e independentes — todas recebem (eventosDoTipo, config) e devolvem
// true/false, sem tocar banco, testáveis isoladamente:
//
//   contagem_evento   { filtro?, minimoOcorrencias }
//                      -> nº de eventos que combinam com `filtro` >= minimoOcorrencias
//   sequencia         { filtro?, minimoConsecutivas, intervaloDias? (default 7) }
//                      -> maior sequência de datas distintas espaçadas exatamente
//                         `intervaloDias` dias uma da outra >= minimoConsecutivas
//                         (ex: 4 domingos seguidos = 4 datas a cada 7 dias, sem furo)
//   combinacao_exata  { camposEsperados }
//                      -> existe pelo menos 1 evento cujo payload bate EXATAMENTE
//                         (por chave) com `camposEsperados` (ex: presente E gabaritou
//                         E trouxe bíblia, tudo no mesmo evento/payload)
//   marco_unico       { filtro? }
//                      -> existe pelo menos 1 evento que combina com `filtro`
//                         (equivalente a contagem_evento com minimoOcorrencias=1,
//                         mas semanticamente "primeira vez" — não reavalia depois
//                         de desbloqueada, ver avaliarConquistasParaMembro)
//   periodo_perfeito  { filtroFalha, minimoOcorrenciasNoPeriodo, diasPeriodo }
//                      -> pelo menos `minimoOcorrenciasNoPeriodo` eventos dentro dos
//                         últimos `diasPeriodo` dias (prova que "havia expediente" —
//                         sem isso um aluno sem NENHUM evento passaria por "perfeito"
//                         por ausência total de dado) E NENHUM deles combina com
//                         `filtroFalha` (ex: nenhuma AUSENTE no período)
//
// Pré-requisitos (item 1: "progressão em cadeia, não catálogo plano") são
// uma corrente linear: CatalogoConquistas.PreRequisitoConquistaId aponta
// pra outra conquista — só é possível desbloquear B se A (pré-requisito de
// B) já estiver desbloqueada para o MESMO Membro.
//
// Avaliação é sempre "na leitura/no lançamento do evento-gatilho", nunca
// job/timer (mesmo princípio de shared/habilitacaoVoluntarios.js/v5.7 e das
// Cartas de Trânsito/v017 — "calculado, nunca marcação/job manual"):
// registrarEventoEAvaliar() é chamado de dentro de shared/ebdChamada.js e
// shared/ebdAtividades.js logo depois de a presença/resposta ser gravada.
//
// Conquistas já desbloqueadas NUNCA são reavaliadas: avaliarConquistasParaMembro
// primeiro exclui da lista de candidatas qualquer ConquistaId que já apareça em
// ConquistasDesbloqueadas para aquele Membro — o motor só gasta trabalho nas
// conquistas que ainda podem, em tese, ser desbloqueadas agora.
//
// Lógica pura (testável sem banco) primeiro, funções de banco (finas)
// depois — mesmo padrão de shared/ebdChamada.js / shared/escalas.js.
const { sql } = require("./db");
const { registrarAuditoria } = require("./auditoria");
const escopo = require("./escopo");

const TIPOS_REGRA = ["contagem_evento", "sequencia", "combinacao_exata", "marco_unico", "periodo_perfeito"];

// ---------------------------------------------------------------
// Lógica pura
// ---------------------------------------------------------------

// Mesmo cuidado de fuso de shared/estatuto.js::parseData — "YYYY-MM-DD"
// interpretado como data local ao meio-dia, nunca meia-noite (evita erro de
// 1 dia por fuso quando o valor vem de DATE do SQL Server ou string crua).
function paraDataLocal(valor) {
  if (!valor) return null;
  const [ano, mes, dia] = String(valor).slice(0, 10).split("-").map(Number);
  if (!ano || !mes || !dia) return null;
  return new Date(ano, mes - 1, dia, 12, 0, 0);
}

function diaIndice(valor) {
  const data = paraDataLocal(valor);
  if (!data) return null;
  return Math.floor(data.getTime() / (1000 * 60 * 60 * 24));
}

// Comparação de valor "genérica": objetos/arrays por igualdade estrutural
// (JSON), primitivos por ===. Usada tanto no filtro comum quanto na
// combinação exata — a diferença entre os dois tipos de regra está em QUEM
// chama isso (contagem/marco usam filtro parcial; combinação exige que os
// campos informados sejam exatos), não em como o valor é comparado.
function valoresIguais(a, b) {
  if (a && typeof a === "object") return JSON.stringify(a) === JSON.stringify(b);
  return a === b;
}

// `filtro` undefined/null = combina com qualquer evento daquele tipo. Caso
// contrário, TODAS as chaves do filtro precisam bater com o payload.
function eventoCombinaFiltro(evento, filtro) {
  if (!filtro) return true;
  const payload = (evento && evento.payload) || {};
  return Object.keys(filtro).every(chave => valoresIguais(payload[chave], filtro[chave]));
}

function filtrarEventos(eventos, filtro) {
  return (eventos || []).filter(e => eventoCombinaFiltro(e, filtro));
}

// ---- contagem_evento ----
function avaliarContagemEvento(eventos, config) {
  const minimo = Number((config || {}).minimoOcorrencias) || 1;
  return filtrarEventos(eventos, (config || {}).filtro).length >= minimo;
}

// ---- marco_unico ----
// Semanticamente "primeira vez que aconteceu" — na prática, qualquer
// ocorrência que combine com o filtro já satisfaz (a exclusividade de "só
// desbloqueia uma vez" é garantida pela camada de cima, que nunca reavalia
// conquista já desbloqueada — ver avaliarConquistasParaMembro).
function avaliarMarcoUnico(eventos, config) {
  return filtrarEventos(eventos, (config || {}).filtro).length >= 1;
}

// ---- combinacao_exata ----
// "No mesmo evento" é a palavra-chave: um ÚNICO registro de ConquistasEventos
// cujo payload contenha, exatamente, todos os pares chave/valor de
// `camposEsperados` — nunca a soma de campos vindos de eventos diferentes.
function avaliarCombinacaoExata(eventos, config) {
  const campos = (config || {}).camposEsperados;
  if (!campos || Object.keys(campos).length === 0) return false;
  return filtrarEventos(eventos, campos).length >= 1;
}

// ---- sequencia ----
// Maior sequência de dias distintos (já ordenados) espaçados exatamente
// `intervalo` dias um do outro, sem furo — função pura reaproveitável,
// separada de avaliarSequencia só pra facilitar teste unitário direto.
function calcularMaiorSequencia(diasOrdenadosUnicos, intervalo) {
  if (!diasOrdenadosUnicos || diasOrdenadosUnicos.length === 0) return 0;
  let maior = 1, atual = 1;
  for (let i = 1; i < diasOrdenadosUnicos.length; i++) {
    if (diasOrdenadosUnicos[i] - diasOrdenadosUnicos[i - 1] === intervalo) {
      atual++;
      maior = Math.max(maior, atual);
    } else {
      atual = 1;
    }
  }
  return maior;
}

function avaliarSequencia(eventos, config) {
  const cfg = config || {};
  const intervalo = Number.isInteger(cfg.intervaloDias) ? cfg.intervaloDias : 7;
  const minimo = Number(cfg.minimoConsecutivas) || 1;
  const dias = filtrarEventos(eventos, cfg.filtro)
    .map(e => diaIndice(e.ocorridoEm))
    .filter(d => d !== null);
  const unicos = Array.from(new Set(dias)).sort((a, b) => a - b);
  return calcularMaiorSequencia(unicos, intervalo) >= minimo;
}

// ---- periodo_perfeito ----
// `agora` é injetável (default new Date()) pra a função continuar 100%
// testável sem depender do relógio real.
function avaliarPeriodoPerfeito(eventos, config, agora) {
  const cfg = config || {};
  const dataRef = agora ? paraDataLocal(agora) || new Date(agora) : new Date();
  const refIndice = Math.floor(dataRef.getTime() / (1000 * 60 * 60 * 24));
  const diasPeriodo = Number(cfg.diasPeriodo) || 90;
  const minimoOcorrencias = Number(cfg.minimoOcorrenciasNoPeriodo) || 1;

  const noPeriodo = (eventos || []).filter(e => {
    const idx = diaIndice(e.ocorridoEm);
    return idx !== null && refIndice - idx >= 0 && refIndice - idx <= diasPeriodo;
  });

  if (noPeriodo.length < minimoOcorrencias) return false; // sem evidência suficiente de que "houve expediente"
  const teveFalha = noPeriodo.some(e => eventoCombinaFiltro(e, cfg.filtroFalha));
  return !teveFalha;
}

// Dispatcher único — `regra` é { tipoRegra, config (já parseado) }, `eventos`
// é a lista JÁ FILTRADA pelo TipoEvento da regra (quem chama decide qual
// fatia do histórico do Membro é relevante).
function avaliarRegra(regra, eventos, agora) {
  switch (regra.tipoRegra) {
    case "contagem_evento": return avaliarContagemEvento(eventos, regra.config);
    case "marco_unico": return avaliarMarcoUnico(eventos, regra.config);
    case "combinacao_exata": return avaliarCombinacaoExata(eventos, regra.config);
    case "sequencia": return avaliarSequencia(eventos, regra.config);
    case "periodo_perfeito": return avaliarPeriodoPerfeito(eventos, regra.config, agora);
    default: return false;
  }
}

// Pré-requisito em cadeia: sem pré-requisito, sempre elegível; com
// pré-requisito, só elegível se ele já estiver no conjunto de desbloqueadas
// DESTE Membro (Set<ConquistaId>).
function elegivelPorPreRequisito(conquista, idsDesbloqueadas) {
  if (!conquista.preRequisitoConquistaId) return true;
  return idsDesbloqueadas.has(conquista.preRequisitoConquistaId);
}

// Oculta até desbloquear: uma conquista Oculta some da listagem pública do
// catálogo pra quem ainda não a desbloqueou (mantém a "surpresa" de
// progressão em cadeia) — mas continua sendo AVALIADA no motor
// normalmente; só a VISIBILIDADE na tela muda.
function visivelNoCatalogo(conquista, desbloqueada) {
  return !conquista.oculta || desbloqueada;
}

// Pontuação (item 3): soma pesos por TipoEvento sobre os eventos do Membro,
// mais o bônus fixo de cada conquista já desbloqueada. Um evento só soma se
// seu payload não marcar `contaParaScore: false` — é a convenção genérica
// (nenhum campo com nome específico de EBD) que um produtor de evento usa
// pra dizer "isto aconteceu, mas não é um ganho de pontuação" (ex:
// shared/ebdChamada.js loga AUSENTE como evento — pra periodo_perfeito
// enxergar a falta — mas marca contaParaScore:false pra não pontuar falta).
function calcularScoreMembro(eventos, pesosPorTipoEvento, bonusTotal) {
  let pontos = Number(bonusTotal) || 0;
  for (const evento of eventos || []) {
    if (evento.payload && evento.payload.contaParaScore === false) continue;
    const peso = (pesosPorTipoEvento || {})[evento.tipoEvento];
    if (peso !== undefined && peso !== null) pontos += Number(peso);
  }
  return Math.round(pontos * 100) / 100;
}

// Ranking: maior score primeiro; empate quebrado por (1) mais conquistas
// desbloqueadas, (2) quem chegou primeiro (data do desbloqueio mais antigo
// — prêmia consistência ao longo do tempo, não só o placar do dia), (3)
// MembroId crescente como desempate determinístico final (nunca "aleatório"
// entre execuções).
function ordenarRanking(linhas) {
  return [...(linhas || [])].sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if ((b.totalConquistas || 0) !== (a.totalConquistas || 0)) return (b.totalConquistas || 0) - (a.totalConquistas || 0);
    const tA = a.primeiraConquistaEm ? new Date(a.primeiraConquistaEm).getTime() : Infinity;
    const tB = b.primeiraConquistaEm ? new Date(b.primeiraConquistaEm).getTime() : Infinity;
    if (tA !== tB) return tA - tB;
    return a.membroId - b.membroId;
  });
}

function validarRegraConfig({ tipoRegra, tipoEvento, config }) {
  if (!TIPOS_REGRA.includes(tipoRegra)) {
    return { valido: false, mensagem: `Tipo de regra inválido. Use um de: ${TIPOS_REGRA.join(", ")}.` };
  }
  if (!tipoEvento || !String(tipoEvento).trim()) {
    return { valido: false, mensagem: "Informe o tipo de evento da regra." };
  }
  const cfg = config || {};
  if (tipoRegra === "contagem_evento" && !(Number(cfg.minimoOcorrencias) > 0)) {
    return { valido: false, mensagem: "contagem_evento exige minimoOcorrencias > 0." };
  }
  if (tipoRegra === "sequencia" && !(Number(cfg.minimoConsecutivas) > 0)) {
    return { valido: false, mensagem: "sequencia exige minimoConsecutivas > 0." };
  }
  if (tipoRegra === "combinacao_exata" && (!cfg.camposEsperados || Object.keys(cfg.camposEsperados).length === 0)) {
    return { valido: false, mensagem: "combinacao_exata exige camposEsperados (ao menos 1 campo)." };
  }
  if (tipoRegra === "periodo_perfeito" && !(Number(cfg.diasPeriodo) > 0)) {
    return { valido: false, mensagem: "periodo_perfeito exige diasPeriodo > 0." };
  }
  return { valido: true };
}

// ---------------------------------------------------------------
// Funções de banco (finas)
// ---------------------------------------------------------------

function parseJsonSeguro(texto, padrao) {
  if (texto === null || texto === undefined) return padrao;
  try { return JSON.parse(texto); } catch { return padrao; }
}

// ---- Registro de tipos de evento (item 1/6 — extensibilidade sem tocar o motor) ----

async function listarTiposEvento(pool) {
  const result = await pool.request().query(`SELECT * FROM ConquistaTiposEvento ORDER BY ModuloOrigem, TipoEvento`);
  return result.recordset.map(row => ({
    tipoEvento: row.TipoEvento, descricao: row.Descricao, moduloOrigem: row.ModuloOrigem, ativo: !!row.Ativo
  }));
}

// Cadastrar um tipo de evento novo é a ÚNICA coisa que um consumidor futuro
// (Reuniões/Escala de Serviço/Contribuição) precisa fazer pra existir — sem
// alterar este arquivo. Idempotente: registrar de novo o mesmo TipoEvento
// só atualiza descrição/módulo.
async function registrarTipoEvento(pool, { tipoEvento, descricao, moduloOrigem }) {
  if (!tipoEvento || !String(tipoEvento).trim()) return { sucesso: false, mensagem: "Informe o tipoEvento." };
  const chave = String(tipoEvento).trim().toUpperCase();
  await pool.request()
    .input("tipoEvento", sql.NVarChar(40), chave)
    .input("descricao", sql.NVarChar(200), descricao || null)
    .input("modulo", sql.NVarChar(40), moduloOrigem || null)
    .query(`
      MERGE ConquistaTiposEvento AS alvo
      USING (SELECT @tipoEvento AS TipoEvento) AS origem ON alvo.TipoEvento = origem.TipoEvento
      WHEN MATCHED THEN UPDATE SET Descricao = @descricao, ModuloOrigem = @modulo
      WHEN NOT MATCHED THEN INSERT (TipoEvento, Descricao, ModuloOrigem) VALUES (@tipoEvento, @descricao, @modulo);
    `);
  return { sucesso: true, mensagem: "✅ Tipo de evento registrado." };
}

// ---- Catálogo + regras ----

function mapearConquista(row) {
  return {
    conquistaId: row.ConquistaId, nome: row.Nome, icone: row.Icone, descricao: row.Descricao,
    oculta: !!row.Oculta, preRequisitoConquistaId: row.PreRequisitoConquistaId,
    pontosBonus: row.PontosBonus, ativa: !!row.Ativa
  };
}

function mapearRegra(row) {
  return {
    regraId: row.RegraId, conquistaId: row.ConquistaId, tipoRegra: row.TipoRegra, tipoEvento: row.TipoEvento,
    config: parseJsonSeguro(row.ConfigJson, {}), ativa: !!row.Ativa
  };
}

async function listarCatalogoComRegras(pool, { incluirInativas } = {}) {
  const filtroAtiva = incluirInativas ? "" : "WHERE Ativa = 1";
  const conquistas = await pool.request().query(`SELECT * FROM CatalogoConquistas ${filtroAtiva} ORDER BY ConquistaId`);
  const regras = await pool.request().query(`SELECT * FROM RegrasConquista WHERE Ativa = 1`);
  const regrasPorConquista = new Map();
  for (const r of regras.recordset.map(mapearRegra)) {
    if (!regrasPorConquista.has(r.conquistaId)) regrasPorConquista.set(r.conquistaId, []);
    regrasPorConquista.get(r.conquistaId).push(r);
  }
  return conquistas.recordset.map(mapearConquista).map(c => ({ ...c, regras: regrasPorConquista.get(c.conquistaId) || [] }));
}

async function criarConquista(pool, { nome, icone, descricao, oculta, preRequisitoConquistaId, pontosBonus, criadoPorMembroId }) {
  if (!nome || !String(nome).trim()) return { sucesso: false, mensagem: "Informe o nome da conquista." };
  const result = await pool.request()
    .input("nome", sql.NVarChar(150), nome.trim()).input("icone", sql.NVarChar(20), icone || null)
    .input("descricao", sql.NVarChar(400), descricao || null).input("oculta", sql.Bit, !!oculta)
    .input("preReq", sql.Int, preRequisitoConquistaId || null).input("bonus", sql.Int, Number.isInteger(pontosBonus) ? pontosBonus : 0)
    .input("criadoPor", sql.Int, criadoPorMembroId || null)
    .query(`
      INSERT INTO CatalogoConquistas (Nome, Icone, Descricao, Oculta, PreRequisitoConquistaId, PontosBonus, CriadoPorMembroId)
      OUTPUT INSERTED.ConquistaId
      VALUES (@nome, @icone, @descricao, @oculta, @preReq, @bonus, @criadoPor)
    `);
  const conquistaId = result.recordset[0].ConquistaId;
  await registrarAuditoria({ tabela: "CatalogoConquistas", registroId: conquistaId, acao: "CONQUISTA_CRIADA", usuarioId: criadoPorMembroId, dadosAntes: null, dadosDepois: { nome } });
  return { sucesso: true, conquistaId, mensagem: "✅ Conquista criada." };
}

async function atualizarConquista(pool, { conquistaId, nome, icone, descricao, oculta, preRequisitoConquistaId, pontosBonus, ativa, atualizadoPorMembroId }) {
  const existente = await pool.request().input("id", sql.Int, conquistaId).query(`SELECT * FROM CatalogoConquistas WHERE ConquistaId = @id`);
  if (existente.recordset.length === 0) return { sucesso: false, mensagem: "Conquista não encontrada." };
  if (preRequisitoConquistaId && Number(preRequisitoConquistaId) === Number(conquistaId)) {
    return { sucesso: false, mensagem: "Uma conquista não pode ser pré-requisito de si mesma." };
  }
  await pool.request()
    .input("id", sql.Int, conquistaId).input("nome", sql.NVarChar(150), nome.trim())
    .input("icone", sql.NVarChar(20), icone || null).input("descricao", sql.NVarChar(400), descricao || null)
    .input("oculta", sql.Bit, !!oculta).input("preReq", sql.Int, preRequisitoConquistaId || null)
    .input("bonus", sql.Int, Number.isInteger(pontosBonus) ? pontosBonus : 0).input("ativa", sql.Bit, ativa !== false)
    .query(`
      UPDATE CatalogoConquistas SET Nome = @nome, Icone = @icone, Descricao = @descricao, Oculta = @oculta,
        PreRequisitoConquistaId = @preReq, PontosBonus = @bonus, Ativa = @ativa, AtualizadoEm = SYSUTCDATETIME()
      WHERE ConquistaId = @id
    `);
  await registrarAuditoria({ tabela: "CatalogoConquistas", registroId: conquistaId, acao: "CONQUISTA_ATUALIZADA", usuarioId: atualizadoPorMembroId, dadosAntes: mapearConquista(existente.recordset[0]), dadosDepois: { nome, oculta, pontosBonus } });
  return { sucesso: true, mensagem: "✅ Conquista atualizada." };
}

async function criarRegra(pool, { conquistaId, tipoRegra, tipoEvento, config, criadoPorMembroId }) {
  const validacao = validarRegraConfig({ tipoRegra, tipoEvento, config });
  if (!validacao.valido) return { sucesso: false, mensagem: validacao.mensagem };
  const conquista = await pool.request().input("id", sql.Int, conquistaId).query(`SELECT ConquistaId FROM CatalogoConquistas WHERE ConquistaId = @id`);
  if (conquista.recordset.length === 0) return { sucesso: false, mensagem: "Conquista não encontrada." };
  const tipoEventoRow = await pool.request().input("t", sql.NVarChar(40), tipoEvento).query(`SELECT TipoEvento FROM ConquistaTiposEvento WHERE TipoEvento = @t`);
  if (tipoEventoRow.recordset.length === 0) return { sucesso: false, mensagem: "Tipo de evento não cadastrado — registre-o antes (ConquistaTiposEvento)." };

  const result = await pool.request()
    .input("conquistaId", sql.Int, conquistaId).input("tipoRegra", sql.NVarChar(20), tipoRegra)
    .input("tipoEvento", sql.NVarChar(40), tipoEvento).input("config", sql.NVarChar(sql.MAX), JSON.stringify(config || {}))
    .query(`
      INSERT INTO RegrasConquista (ConquistaId, TipoRegra, TipoEvento, ConfigJson)
      OUTPUT INSERTED.RegraId
      VALUES (@conquistaId, @tipoRegra, @tipoEvento, @config)
    `);
  const regraId = result.recordset[0].RegraId;
  await registrarAuditoria({ tabela: "RegrasConquista", registroId: regraId, acao: "REGRA_CRIADA", usuarioId: criadoPorMembroId, dadosAntes: null, dadosDepois: { conquistaId, tipoRegra, tipoEvento } });
  return { sucesso: true, regraId, mensagem: "✅ Regra criada." };
}

async function desativarRegra(pool, { regraId, atualizadoPorMembroId }) {
  const existente = await pool.request().input("id", sql.Int, regraId).query(`SELECT * FROM RegrasConquista WHERE RegraId = @id`);
  if (existente.recordset.length === 0) return { sucesso: false, mensagem: "Regra não encontrada." };
  await pool.request().input("id", sql.Int, regraId).query(`UPDATE RegrasConquista SET Ativa = 0 WHERE RegraId = @id`);
  await registrarAuditoria({ tabela: "RegrasConquista", registroId: regraId, acao: "REGRA_DESATIVADA", usuarioId: atualizadoPorMembroId, dadosAntes: null, dadosDepois: null });
  return { sucesso: true, mensagem: "✅ Regra desativada." };
}

// ---- Eventos + avaliação (o coração do motor) ----

async function buscarHistoricoMembro(pool, membroId) {
  const result = await pool.request().input("membroId", sql.Int, membroId).query(`
    SELECT EventoId, TipoEvento, PayloadJson, OcorridoEm FROM ConquistasEventos WHERE MembroId = @membroId ORDER BY OcorridoEm
  `);
  return result.recordset.map(row => ({
    eventoId: row.EventoId, tipoEvento: row.TipoEvento, payload: parseJsonSeguro(row.PayloadJson, {}), ocorridoEm: row.OcorridoEm
  }));
}

async function registrarEvento(pool, { membroId, tipoEvento, payload, ocorridoEm }) {
  const result = await pool.request()
    .input("membroId", sql.Int, membroId).input("tipoEvento", sql.NVarChar(40), tipoEvento)
    .input("payload", sql.NVarChar(sql.MAX), JSON.stringify(payload || {}))
    .input("ocorridoEm", sql.Date, ocorridoEm || new Date())
    .query(`
      INSERT INTO ConquistasEventos (MembroId, TipoEvento, PayloadJson, OcorridoEm)
      OUTPUT INSERTED.EventoId
      VALUES (@membroId, @tipoEvento, @payload, @ocorridoEm)
    `);
  return result.recordset[0].EventoId;
}

// Núcleo do motor: recalcula, NA HORA, quais conquistas o Membro acabou de
// desbloquear. Nunca reavalia o que já está em ConquistasDesbloqueadas — a
// exclusão acontece ANTES de qualquer avaliarRegra rodar, então uma
// conquista desbloqueada nunca gasta ciclo de CPU de novo em lançamentos
// futuros. Roda em mais de uma passada (até estabilizar) porque desbloquear
// uma conquista pode liberar imediatamente a próxima da cadeia (pré-requisito
// satisfeito no mesmo instante, ex: 4º domingo seguido bate "Primeira
// Presença" — já desbloqueada antes — e "Sequência de Ouro" ao mesmo tempo).
async function avaliarConquistasParaMembro(pool, membroId, agora) {
  const [catalogo, historico, desbloqueadasRows] = await Promise.all([
    listarCatalogoComRegras(pool, { incluirInativas: false }),
    buscarHistoricoMembro(pool, membroId),
    pool.request().input("membroId", sql.Int, membroId).query(`SELECT ConquistaId FROM ConquistasDesbloqueadas WHERE MembroId = @membroId`)
  ]);

  const desbloqueadasIds = new Set(desbloqueadasRows.recordset.map(r => r.ConquistaId));
  const eventosPorTipo = new Map();
  for (const e of historico) {
    if (!eventosPorTipo.has(e.tipoEvento)) eventosPorTipo.set(e.tipoEvento, []);
    eventosPorTipo.get(e.tipoEvento).push(e);
  }

  const novasDesbloqueadas = [];
  let mudou = true;
  while (mudou) {
    mudou = false;
    for (const conquista of catalogo) {
      if (desbloqueadasIds.has(conquista.conquistaId)) continue;
      if (!elegivelPorPreRequisito(conquista, desbloqueadasIds)) continue;

      for (const regra of conquista.regras) {
        const eventosDoTipo = eventosPorTipo.get(regra.tipoEvento) || [];
        if (avaliarRegra(regra, eventosDoTipo, agora)) {
          await pool.request()
            .input("conquistaId", sql.Int, conquista.conquistaId).input("membroId", sql.Int, membroId).input("regraId", sql.Int, regra.regraId)
            .query(`INSERT INTO ConquistasDesbloqueadas (ConquistaId, MembroId, RegraId) VALUES (@conquistaId, @membroId, @regraId)`);
          await registrarAuditoria({
            tabela: "ConquistasDesbloqueadas", registroId: conquista.conquistaId, acao: "CONQUISTA_DESBLOQUEADA",
            usuarioId: membroId, dadosAntes: null, dadosDepois: { membroId, conquistaId: conquista.conquistaId, regraId: regra.regraId }
          });
          desbloqueadasIds.add(conquista.conquistaId);
          novasDesbloqueadas.push({ conquistaId: conquista.conquistaId, nome: conquista.nome, icone: conquista.icone, pontosBonus: conquista.pontosBonus });
          mudou = true;
          break; // já desbloqueou por esta regra — não precisa testar as outras regras da mesma conquista
        }
      }
    }
  }

  return novasDesbloqueadas;
}

// Entry point único que os módulos consumidores chamam: registra o evento e,
// na mesma chamada (site do lançamento, nunca em job separado), avalia o
// que acabou de mudar para aquele Membro.
async function registrarEventoEAvaliar(pool, { membroId, tipoEvento, payload, ocorridoEm }) {
  await registrarEvento(pool, { membroId, tipoEvento, payload, ocorridoEm });
  return avaliarConquistasParaMembro(pool, membroId);
}

// ---- Score ----

async function buscarPesosScoreConfig(pool, { congregacaoId } = {}) {
  const result = await pool.request().query(`SELECT * FROM ScoreConfig`);
  const linhas = result.recordset;
  let ancestrais = null;
  if (congregacaoId) {
    const cong = await pool.request().input("id", sql.Int, congregacaoId).query(`SELECT AreaId FROM Congregacoes WHERE CongregacaoId = @id`);
    if (cong.recordset[0]) {
      ancestrais = await escopo.ancestraisTerritoriais(pool, sql, 1, congregacaoId);
    }
  }
  const pesos = {};
  // Passada 1: padrão geral (Escopo NULL).
  for (const l of linhas) if (!l.EscopoTipo && !l.EscopoId) pesos[l.TipoEvento] = Number(l.Peso);
  // Passada 2: override territorial, do nível mais amplo pro mais específico
  // (mesma regra de "nível mais alto é lido primeiro, o mais específico
  // prevalece por último" usada em membroAutorizadoNoOrgaoLocal).
  if (ancestrais) {
    const ordem = [
      ["DISTRITO", ancestrais.distritoId], ["QUADRANTE", ancestrais.quadranteId], ["REGIAO", ancestrais.regiaoId],
      ["AREA", ancestrais.areaId], ["CONGREGACAO", congregacaoId]
    ];
    for (const [tipo, id] of ordem) {
      if (!id) continue;
      for (const l of linhas) if (l.EscopoTipo === tipo && l.EscopoId === id) pesos[l.TipoEvento] = Number(l.Peso);
    }
  }
  return pesos;
}

async function listarConquistasDesbloqueadasMembro(pool, membroId) {
  const result = await pool.request().input("membroId", sql.Int, membroId).query(`
    SELECT d.*, c.Nome, c.Icone, c.PontosBonus FROM ConquistasDesbloqueadas d
    JOIN CatalogoConquistas c ON c.ConquistaId = d.ConquistaId
    WHERE d.MembroId = @membroId ORDER BY d.DesbloqueadoEm
  `);
  return result.recordset.map(row => ({
    conquistaId: row.ConquistaId, nome: row.Nome, icone: row.Icone, pontosBonus: row.PontosBonus,
    desbloqueadoEm: row.DesbloqueadoEm
  }));
}

// Painel individual (item 3/4 — "usada tanto no painel individual quanto
// num ranking por escopo"): catálogo já filtrado por visibilidade (oculta
// escondida até desbloquear), pontuação e conquistas do próprio Membro.
async function buscarPainelMembro(pool, membroId, { congregacaoId } = {}) {
  const [catalogo, desbloqueadas, historico, pesos] = await Promise.all([
    listarCatalogoComRegras(pool, { incluirInativas: false }),
    listarConquistasDesbloqueadasMembro(pool, membroId),
    buscarHistoricoMembro(pool, membroId),
    buscarPesosScoreConfig(pool, { congregacaoId })
  ]);
  const idsDesbloqueadas = new Set(desbloqueadas.map(d => d.conquistaId));
  const bonusTotal = desbloqueadas.reduce((soma, d) => soma + (d.pontosBonus || 0), 0);
  const score = calcularScoreMembro(historico, pesos, bonusTotal);

  const catalogoVisivel = catalogo
    .filter(c => visivelNoCatalogo(c, idsDesbloqueadas.has(c.conquistaId)))
    .map(c => ({
      conquistaId: c.conquistaId, nome: c.nome, icone: c.icone, descricao: c.descricao,
      pontosBonus: c.pontosBonus, preRequisitoConquistaId: c.preRequisitoConquistaId,
      desbloqueada: idsDesbloqueadas.has(c.conquistaId)
    }));

  return { score, conquistasDesbloqueadas: desbloqueadas, catalogo: catalogoVisivel };
}

// Ranking por escopo (item 3): reaproveita shared/escopo.js pra resolver
// território (mesmo princípio de reúso já usado na v5.5.1/v5.8), com um
// escopo adicional só desta tela — "TURMA" — que não é territorial (uma
// Turma de EBD não corresponde a um nível de Lideranca), resolvido direto
// contra EbdAlunos/EbdTurmas.
async function listarMembrosDoEscopo(pool, { escopoTipo, escopoId }) {
  if (escopoTipo === "TURMA") {
    const result = await pool.request().input("turmaId", sql.Int, escopoId).query(`
      SELECT DISTINCT a.MembroId, m.Nome FROM EbdAlunos a JOIN MembroReferencia m ON m.MembroId = a.MembroId
      WHERE a.TurmaId = @turmaId AND a.Ativo = 1
    `);
    return result.recordset.map(r => ({ membroId: r.MembroId, nome: r.Nome }));
  }

  const nomesCongregacoes = await escopo.resolverEscopoCongregacoes(pool, escopoTipo, escopoId);
  let condicao = "1=1";
  const request = pool.request();
  if (nomesCongregacoes !== "TODAS") {
    if (nomesCongregacoes.length === 0) return [];
    const params = nomesCongregacoes.map((nome, i) => { request.input(`nome${i}`, sql.NVarChar(150), nome); return `@nome${i}`; });
    condicao = `cg.Nome IN (${params.join(",")})`;
  }
  const result = await request.query(`
    SELECT DISTINCT a.MembroId, m.Nome FROM EbdAlunos a
    JOIN EbdTurmas t ON t.TurmaId = a.TurmaId
    JOIN Congregacoes cg ON cg.CongregacaoId = t.CongregacaoId
    JOIN MembroReferencia m ON m.MembroId = a.MembroId
    WHERE a.Ativo = 1 AND ${condicao}
  `);
  return result.recordset.map(r => ({ membroId: r.MembroId, nome: r.Nome }));
}

async function listarRanking(pool, { escopoTipo, escopoId }) {
  const membros = await listarMembrosDoEscopo(pool, { escopoTipo, escopoId });
  const linhas = [];
  for (const membro of membros) {
    const desbloqueadas = await listarConquistasDesbloqueadasMembro(pool, membro.membroId);
    const historico = await buscarHistoricoMembro(pool, membro.membroId);
    const pesos = await buscarPesosScoreConfig(pool, {});
    const bonusTotal = desbloqueadas.reduce((soma, d) => soma + (d.pontosBonus || 0), 0);
    linhas.push({
      membroId: membro.membroId, nome: membro.nome,
      score: calcularScoreMembro(historico, pesos, bonusTotal),
      totalConquistas: desbloqueadas.length,
      primeiraConquistaEm: desbloqueadas.length ? desbloqueadas[0].desbloqueadoEm : null
    });
  }
  return ordenarRanking(linhas);
}

module.exports = {
  TIPOS_REGRA,
  // Lógica pura
  paraDataLocal, diaIndice, valoresIguais, eventoCombinaFiltro, filtrarEventos,
  avaliarContagemEvento, avaliarMarcoUnico, avaliarCombinacaoExata,
  calcularMaiorSequencia, avaliarSequencia, avaliarPeriodoPerfeito, avaliarRegra,
  elegivelPorPreRequisito, visivelNoCatalogo, calcularScoreMembro, ordenarRanking,
  validarRegraConfig,
  // Banco
  listarTiposEvento, registrarTipoEvento,
  listarCatalogoComRegras, criarConquista, atualizarConquista, criarRegra, desativarRegra,
  buscarHistoricoMembro, registrarEvento, avaliarConquistasParaMembro, registrarEventoEAvaliar,
  buscarPesosScoreConfig, listarConquistasDesbloqueadasMembro, buscarPainelMembro,
  listarMembrosDoEscopo, listarRanking
};
