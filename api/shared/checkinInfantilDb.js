// shared/checkinInfantilDb.js (v7.10 — Check-in infantil com cadeia de custódia)
//
// A camada de banco da regra pura de shared/checkinInfantil.js. Toda decisão de regra (código, janela, lotação, quem pode retirar, validações) está lá, pura e testada;
// aqui se carrega o que a regra pede, se chama a regra e se grava só o que ela decidiu. Funções devolvem { sucesso, mensagem, ... }; recusa de regra é sucesso:false (a rota a
// mostra como 422); `proibido:true` vira 403; `naoAchou:true` vira 404; `mudou:true` é corrida perdida (409).
//
// O que protege a criança, em ordem:
//  1) o código é gerado no servidor e só o HMAC dele é gravado (nunca o texto, nunca em log nem em auditoria);
//  2) cada tentativa de código é RESERVADA no banco antes de ser conferida (UPDATE com contagem): mil tentativas em paralelo não passam de 5;
//  3) a retirada é um UPDATE que só vale se a criança ainda está "na sala" com a mesma geração do código (duas pessoas retirando a mesma criança: só uma vence);
//  4) check-in e saída de voluntário correm sob a mesma trava da sala (sp_getapplock), com a lotação lida DENTRO da transação: dois voluntários não estouram a proporção;
//  5) a aptidão de quem opera é reavaliada a CADA ato (a v7.7 calcula na leitura): quem perdeu a habilitação no meio do serviço para de operar na hora.
const crypto = require("crypto");
const { sql } = require("./db");
const { registrarAuditoria } = require("./auditoria");
const { hojeBrasilia } = require("./dataBrasilia");
const { resolverSegredo } = require("./segredoSessao");
const vol = require("./voluntariado");
const mm = require("./ministerioMenores");
const mmDb = require("./ministerioMenoresDb");
const mc = require("./menoresConsentimento");
const mcDb = require("./menoresConsentimentoDb");
const ck = require("./checkinInfantil");
const { lerPrazoDias, notificarAgora, isoInstante } = require("./canaisDb");
const { obterTrava } = require("./financeiroSeguro");

const MAX_IN = 400;
const STATUS_ESCALADO_SQL = "'ACEITO','CONFIRMADO'";
let SEGREDO = null;
function segredo() { if (!SEGREDO) SEGREDO = resolverSegredo(); return SEGREDO; }

function idsValidos(lista) { return [...new Set((lista || []).map(Number).filter((n) => Number.isInteger(n) && n > 0))]; }
function listaIn(request, prefixo, valores, tipo = sql.Int) {
  return valores.map((v, i) => { request.input(`${prefixo}${i}`, tipo, v); return `@${prefixo}${i}`; }).join(",");
}
const numeroDoErro = (e) => e && (e.number || (e.originalError && e.originalError.info && e.originalError.info.number));
const duplicado = (e) => numeroDoErro(e) === 2627 || numeroDoErro(e) === 2601;
async function fecharTransacao(transaction, ok) {
  try { if (ok) await transaction.commit(); else await transaction.rollback(); } catch (e) { /* a transação já pode ter sido encerrada pelo servidor */ }
}
const iso = isoInstante;
const dia = (v) => (v == null ? null : v instanceof Date ? v.toISOString().slice(0, 10) : String(v).slice(0, 10));

// ---------------------------------------------------------------
// Prazos
// ---------------------------------------------------------------

async function lerPrazos(pool) {
  const s = ck.SIGLAS_PRAZO;
  return ck.prazosDoCheckin({
    abreMinutosAntes: await lerPrazoDias(pool, s.abreMinutosAntes, ck.JANELA_ANTES_MIN_PADRAO),
    fechaHorasDepois: await lerPrazoDias(pool, s.fechaHorasDepois, ck.JANELA_DEPOIS_HORAS_PADRAO),
    tentativasCodigo: await lerPrazoDias(pool, s.tentativasCodigo, ck.TENTATIVAS_PADRAO),
    visitanteContatoDias: await lerPrazoDias(pool, s.visitanteContatoDias, ck.VISITANTE_CONTATO_DIAS_PADRAO)
  });
}

// ---------------------------------------------------------------
// A sala e quem opera
// ---------------------------------------------------------------

// A sala é o par (serviço, equipe com a marca "contato com menores"), da mesma congregação. Sala que não existe, equipe sem a marca e serviço de outra congregação
// recebem a mesma resposta (a rota não serve de sonda).
// `exigirMarca: false` é para o que lida com criança que JÁ ESTÁ na sala (ler a sala, retirar, segunda via, destravar, decidir, sair): se a liderança tirar a marca da equipe (ou
// desativá-la) no meio do serviço, a criança que está lá dentro continua podendo ser retirada. Achado na prova no banco real: com a marca tirada, toda retirada dava 422 e as crianças
// ficavam presas na sala. Só o que traz criança NOVA (entrar na sala, check-in, buscar) exige a marca.
async function contextoDaSala(pool, { servicoId, equipeId }, { exigirMarca = true } = {}) {
  const r = await pool.request().input("s", sql.Int, servicoId).input("e", sql.Int, equipeId).query(`
    SELECT s.ServicoId, s.DataHora, s.Descricao, s.Status AS ServicoStatus, e.EquipeId, e.Nome AS EquipeNome, e.FaixaEtariaMenores, e.LiderMembroId, e.ContatoComMenores,
           e.Ativa, e.CongregacaoId, c.Nome AS CongregacaoNome
    FROM EscalasServicos s
    JOIN EscalasEquipes e ON e.EquipeId = @e AND e.CongregacaoId = s.CongregacaoId
    JOIN Congregacoes c ON c.CongregacaoId = e.CongregacaoId
    WHERE s.ServicoId = @s`);
  const x = r.recordset[0];
  if (!x) return { sucesso: false, naoAchou: true, mensagem: ck.MENSAGENS.SALA_NAO_ENCONTRADA };
  if (exigirMarca && !x.ContatoComMenores) return { sucesso: false, mensagem: ck.MENSAGENS.SALA_SEM_MARCA };
  return {
    sucesso: true,
    sala: {
      servicoId: x.ServicoId, equipeId: x.EquipeId, equipeNome: x.EquipeNome, faixa: x.FaixaEtariaMenores || null, liderMembroId: x.LiderMembroId ? Number(x.LiderMembroId) : null,
      congregacaoId: x.CongregacaoId, congregacaoNome: x.CongregacaoNome, dataHora: iso(x.DataHora), descricao: x.Descricao || null, servicoStatus: x.ServicoStatus, equipeAtiva: !!x.Ativa, comMarca: !!x.ContatoComMenores
    }
  };
}

// A pessoa tem relação com a sala (está escalada nela, aceita ou confirmada, ou lidera a equipe)? É o que decide se a rota diz "não é seu" ou "não existe": quem não tem relação
// nenhuma recebe sempre a resposta de "não existe" (nem a sala nem o registro viram sonda para quem só tem um login). Não olha a aptidão: o inapto tem relação e ouve o motivo.
async function relacionadoComASala(pool, sala, membroId) {
  const id = Number(membroId);
  if (sala.liderMembroId === id) return true;
  const r = await pool.request().input("s", sql.Int, sala.servicoId).input("e", sql.Int, sala.equipeId).input("m", sql.Int, id)
    .query(`SELECT TOP 1 1 AS x FROM EscalasAlocacoes WHERE ServicoId = @s AND EquipeId = @e AND MembroId = @m AND Status IN (${STATUS_ESCALADO_SQL})`);
  return !!r.recordset[0];
}

// Quem pode operar a sala: escalado nela (aceito ou confirmado) ou líder da equipe, E apto hoje, E adulto. A aptidão é a da v7.7, calculada agora (nunca guardada).
async function papelDoOperador(pool, sala, membroId, { hoje = hojeBrasilia() } = {}) {
  const id = Number(membroId);
  const alocado = (await pool.request().input("s", sql.Int, sala.servicoId).input("e", sql.Int, sala.equipeId).input("m", sql.Int, id)
    .query(`SELECT TOP 1 1 AS x FROM EscalasAlocacoes WHERE ServicoId = @s AND EquipeId = @e AND MembroId = @m AND Status IN (${STATUS_ESCALADO_SQL})`)).recordset[0];
  const lider = sala.liderMembroId === id;
  if (!alocado && !lider) return { pode: false, motivo: ck.MENSAGENS.SEM_ACESSO_A_SALA };
  const ap = await mmDb.aptidaoDe(pool, id, { hoje });
  if (!ap || !ap.apto) {
    const primeiro = ap ? mm.bloqueiosParaAPessoa(ap.bloqueios)[0] : null;
    return { pode: false, motivo: `Você não está apto hoje para servir com menores${primeiro ? `: ${primeiro.mensagem}` : "."}` };
  }
  if (!ap.contaComoAdulto) return { pode: false, motivo: "Só adultos (18 anos ou mais) operam o check-in: o adolescente serve como auxiliar na sala." };
  return { pode: true, aptidao: ap, lider };
}

async function estaPresente(pool, sala, membroId) {
  const r = await pool.request().input("s", sql.Int, sala.servicoId).input("e", sql.Int, sala.equipeId).input("m", sql.Int, Number(membroId))
    .query(`SELECT TOP 1 1 AS x FROM CheckinInfantilVoluntarios WHERE ServicoId = @s AND EquipeId = @e AND MembroId = @m AND SaiuEm IS NULL`);
  return !!r.recordset[0];
}

// Para agir na sala o operador precisa estar apto, ser da escala (ou o líder) E ter entrado na sala. Não há atalho para a liderança: quem lida com criança na porta é gente
// habilitada (os atos de gestão — decidir divergência, destravar, relatório — são outras funções, que a rota libera pela permissão).
async function conferirOperador(pool, sala, membroId, { hoje = hojeBrasilia(), exigirPresenca = true } = {}) {
  const p = await papelDoOperador(pool, sala, membroId, { hoje });
  if (!p.pode) return { sucesso: false, proibido: true, mensagem: p.motivo };
  if (exigirPresenca && !(await estaPresente(pool, sala, membroId))) return { sucesso: false, proibido: true, mensagem: "Entre na sala primeiro (botão \"Entrar na sala\"): só quem está na sala opera o check-in." };
  return { sucesso: true, aptidao: p.aptidao };
}

async function registrarEvento(executor, { registroId = null, servicoId, equipeId, tipo, atorId, detalhe = null }) {
  await executor().input("r", sql.Int, registroId).input("s", sql.Int, servicoId).input("e", sql.Int, equipeId).input("t", sql.NVarChar(32), tipo)
    .input("a", sql.Int, atorId).input("d", sql.NVarChar(100), detalhe)
    .query(`INSERT INTO CheckinInfantilEventos (RegistroId, ServicoId, EquipeId, Tipo, AtorMembroId, Detalhe) VALUES (@r, @s, @e, @t, @a, @d)`);
}
const exec = (pool) => () => pool.request();
const execTx = (tx) => () => new sql.Request(tx);

// ---------------------------------------------------------------
// Presença dos voluntários (os adultos reais da sala)
// ---------------------------------------------------------------

// Quem está na sala agora, com a aptidão de AGORA: só conta como adulto para a proporção quem é apto e tem 18 anos ou mais.
async function presentes(executor, sala, { hoje = hojeBrasilia(), pool } = {}) {
  const linhas = (await executor().input("s", sql.Int, sala.servicoId).input("e", sql.Int, sala.equipeId).query(`
    SELECT v.MembroId, m.Nome, v.EntrouEm FROM CheckinInfantilVoluntarios v JOIN MembroReferencia m ON m.MembroId = v.MembroId
    WHERE v.ServicoId = @s AND v.EquipeId = @e AND v.SaiuEm IS NULL ORDER BY v.PresencaId`)).recordset;
  const aptidoes = linhas.length ? await mmDb.aptidaoEmLote(pool, linhas.map((x) => Number(x.MembroId)), { hoje }) : new Map();
  return linhas.map((x) => {
    const ap = aptidoes.get(Number(x.MembroId));
    return { membroId: Number(x.MembroId), nome: x.Nome, entrouEm: iso(x.EntrouEm), apto: !!(ap && ap.apto), contaComoAdulto: !!(ap && ap.apto && ap.contaComoAdulto) };
  });
}

async function contarCriancasNaSala(executor, sala) {
  const r = await executor().input("s", sql.Int, sala.servicoId).input("e", sql.Int, sala.equipeId)
    .query(`SELECT COUNT(*) AS n FROM CheckinInfantilRegistros WHERE ServicoId = @s AND EquipeId = @e AND Situacao <> 'RETIRADA'`);
  return Number((r.recordset[0] || {}).n || 0);
}

async function parametrosDaProporcao(pool, sala) {
  const prazosMm = await mmDb.lerPrazos(pool);
  const faixas = await mmDb.lerPrazosFaixas(pool);
  return { adultosMinimos: prazosMm.adultosMinimos, criancasPorAdulto: sala.faixa ? mm.criancasPorAdulto(sala.faixa, faixas) : null };
}

async function entrarNaSala(pool, { sala, membroId, hoje = hojeBrasilia(), agoraIso = ck.agoraBrasiliaIso() }) {
  const prazos = await lerPrazos(pool);
  if (sala.servicoStatus !== "PUBLICADA") return { sucesso: false, mensagem: ck.MENSAGENS.SERVICO_NAO_PUBLICADO };
  if (sala.equipeAtiva === false) return { sucesso: false, mensagem: ck.MENSAGENS.EQUIPE_DESATIVADA };
  const janela = ck.avaliarJanela({ servicoIso: sala.dataHora, agoraIso, antesMin: prazos.abreMinutosAntes, depoisHoras: prazos.fechaHorasDepois });
  if (!janela.aberta) return { sucesso: false, mensagem: janela.mensagem };
  const p = await papelDoOperador(pool, sala, membroId, { hoje });
  if (!p.pode) return { sucesso: false, proibido: true, mensagem: p.motivo };
  try {
    await pool.request().input("s", sql.Int, sala.servicoId).input("e", sql.Int, sala.equipeId).input("m", sql.Int, Number(membroId))
      .query(`INSERT INTO CheckinInfantilVoluntarios (ServicoId, EquipeId, MembroId) VALUES (@s, @e, @m)`);
  } catch (e) {
    if (duplicado(e)) {
      // Há dois índices únicos aqui: "já está NESTA sala" (tudo certo) e "já está em OUTRA sala do mesmo serviço" (um adulto só conta num lugar). No segundo caso dizer
      // "você já está na sala" enganava a tela: ela acharia que a pessoa opera esta sala e a primeira tentativa de ato cairia em "entre na sala primeiro".
      if (await estaPresente(pool, sala, membroId)) return { sucesso: true, jaEstava: true, mensagem: "Você já está na sala." };
      return { sucesso: false, mensagem: "Você já está em outra sala deste serviço. Saia dela antes de entrar nesta: um adulto só conta como adulto numa sala." };
    }
    throw e;
  }
  await registrarEvento(exec(pool), { servicoId: sala.servicoId, equipeId: sala.equipeId, tipo: "VOLUNTARIO_ENTROU", atorId: Number(membroId) });
  await registrarAuditoria({ tabela: "CheckinInfantilVoluntarios", registroId: sala.servicoId, acao: "CHECKIN_VOLUNTARIO_ENTROU", usuarioId: Number(membroId), dadosDepois: { servicoId: sala.servicoId, equipeId: sala.equipeId } });
  return { sucesso: true, mensagem: "Você entrou na sala." };
}

// Sair: sob a trava da sala, com a lotação lida dentro da transação — ninguém deixa a sala fora da regra dos dois adultos nem da proporção.
// `porId`: a liderança tira alguém da sala (quem esqueceu de sair); a regra é a mesma: não deixa a sala com criança fora da proporção nem com menos de dois adultos.
async function sairDaSala(pool, { sala, membroId, porId = null, hoje = hojeBrasilia() }) {
  const alvo = Number(membroId);
  const ator = porId || alvo;
  const params = await parametrosDaProporcao(pool, sala);
  const transaction = new sql.Transaction(pool);
  await transaction.begin();
  try {
    if (!(await obterTrava(execTx(transaction), `checkin-sala:${sala.servicoId}:${sala.equipeId}`))) { await fecharTransacao(transaction, false); return { sucesso: false, mensagem: "A sala está ocupada com outra operação. Tente de novo em instantes." }; }
    const aqui = (await new sql.Request(transaction).input("s", sql.Int, sala.servicoId).input("e", sql.Int, sala.equipeId).input("m", sql.Int, alvo)
      .query(`SELECT TOP 1 PresencaId FROM CheckinInfantilVoluntarios WITH (UPDLOCK) WHERE ServicoId = @s AND EquipeId = @e AND MembroId = @m AND SaiuEm IS NULL`)).recordset[0];
    if (!aqui) { await fecharTransacao(transaction, false); return { sucesso: false, mensagem: "Esta pessoa não está na sala." }; }
    const lista = await presentes(execTx(transaction), sala, { hoje, pool });
    const criancas = await contarCriancasNaSala(execTx(transaction), sala);
    const eu = lista.find((x) => x.membroId === alvo);
    const adultos = lista.filter((x) => x.contaComoAdulto).length;
    const saida = ck.avaliarSaidaVoluntario({ adultos, criancas, contaComoAdulto: !!(eu && eu.contaComoAdulto), faixa: sala.faixa, criancasPorAdulto: params.criancasPorAdulto, adultosMinimos: params.adultosMinimos });
    if (!saida.ok) { await fecharTransacao(transaction, false); return { sucesso: false, mensagem: saida.mensagem }; }
    await new sql.Request(transaction).input("p", sql.Int, aqui.PresencaId).query(`UPDATE CheckinInfantilVoluntarios SET SaiuEm = SYSUTCDATETIME() WHERE PresencaId = @p AND SaiuEm IS NULL`);
    await registrarEvento(execTx(transaction), { servicoId: sala.servicoId, equipeId: sala.equipeId, tipo: "VOLUNTARIO_SAIU", atorId: ator, detalhe: ator !== alvo ? "retirado pela liderança" : null });
    await transaction.commit();
  } catch (e) { await fecharTransacao(transaction, false); throw e; }
  await registrarAuditoria({ tabela: "CheckinInfantilVoluntarios", registroId: sala.servicoId, acao: "CHECKIN_VOLUNTARIO_SAIU", usuarioId: ator, dadosDepois: { servicoId: sala.servicoId, equipeId: sala.equipeId } });
  return { sucesso: true, mensagem: "Você saiu da sala." };
}

// ---------------------------------------------------------------
// Quem pode retirar cada criança
// ---------------------------------------------------------------

// Para cada registro: { responsaveis, fixos, daVisita, trouxe }, em consultas em lote (nunca uma por criança).
async function carregarAutorizados(pool, registros, { hoje = hojeBrasilia() } = {}) {
  const mapa = new Map(registros.map((r) => [Number(r.RegistroId), { responsaveis: [], fixos: [], daVisita: [], trouxe: r.TrouxeMembroId || r.TrouxeNome ? { membroId: r.TrouxeMembroId ? Number(r.TrouxeMembroId) : null, nome: r.TrouxeNomeResolvido || null, parentesco: r.TrouxeParentesco || null } : null }]));
  const menores = idsValidos(registros.map((r) => r.MenorMembroId));
  const porMenor = new Map(menores.map((id) => [id, { responsaveis: [], fixos: [] }]));
  if (menores.length) {
    const rq1 = pool.request();
    const resp = await rq1.query(`SELECT r.MenorMembroId, r.ResponsavelMembroId, r.Vinculo, p.Nome FROM VoluntariadoResponsaveis r JOIN MembroReferencia p ON p.MembroId = r.ResponsavelMembroId
      WHERE r.MenorMembroId IN (${listaIn(rq1, "m", menores)}) AND r.RevogadoEm IS NULL ORDER BY r.ResponsavelId`);
    for (const x of resp.recordset) porMenor.get(Number(x.MenorMembroId)).responsaveis.push({ membroId: Number(x.ResponsavelMembroId), nome: x.Nome, vinculo: x.Vinculo });
    const rq2 = pool.request().input("hoje", sql.Date, hoje);
    const fixos = await rq2.query(`SELECT AutorizadoId, MenorMembroId, AutorizadoMembroId, Nome, Parentesco, ValidoAte FROM CheckinInfantilAutorizados
      WHERE MenorMembroId IN (${listaIn(rq2, "m", menores)}) AND RevogadoEm IS NULL AND (ValidoAte IS NULL OR ValidoAte >= @hoje) ORDER BY AutorizadoId`);
    for (const x of fixos.recordset) porMenor.get(Number(x.MenorMembroId)).fixos.push({ autorizadoId: Number(x.AutorizadoId), membroId: x.AutorizadoMembroId ? Number(x.AutorizadoMembroId) : null, nome: x.Nome, parentesco: x.Parentesco, validoAte: dia(x.ValidoAte) });
  }
  const ids = [...mapa.keys()];
  if (ids.length) {
    const rq3 = pool.request();
    const vis = await rq3.query(`SELECT AutorizadoVisitaId, RegistroId, Nome, Parentesco FROM CheckinInfantilAutorizadosVisita WHERE RegistroId IN (${listaIn(rq3, "r", ids)}) ORDER BY AutorizadoVisitaId`);
    for (const x of vis.recordset) mapa.get(Number(x.RegistroId)).daVisita.push({ autorizadoVisitaId: Number(x.AutorizadoVisitaId), nome: x.Nome, parentesco: x.Parentesco });
  }
  for (const r of registros) {
    const m = mapa.get(Number(r.RegistroId));
    const pm = r.MenorMembroId ? porMenor.get(Number(r.MenorMembroId)) : null;
    if (pm) { m.responsaveis = pm.responsaveis; m.fixos = pm.fixos; }
  }
  return new Map([...mapa].map(([id, v]) => [id, ck.montarAutorizados({ ...v, hoje })]));
}

// ---------------------------------------------------------------
// Leitura da sala (a tela atualiza sozinha)
// ---------------------------------------------------------------

const COLUNAS_REGISTRO = `r.RegistroId, r.ServicoId, r.EquipeId, r.CongregacaoId, r.MenorMembroId, r.VisitanteNome, r.VisitanteNascimento, r.IdadeAnos, r.FaixaSala, r.IdadeForaDaFaixa,
  r.TrouxeMembroId, r.TrouxeNome, r.TrouxeParentesco, r.TrouxeContato, r.SaudeTexto, r.SaudeOrigem, r.CodigoGeracao, r.Tentativas, r.Travado, r.Situacao, r.EntregueEm, r.EntreguePorMembroId,
  r.RetiradoEm, r.RetiradoTipo, r.RetiradoMembroId, r.RetiradoNome, r.RetiradoParentesco, r.RetiradoDocumento, r.RetiradoPorOperadorId, r.Divergente, r.DivergenciaPedidaEm,
  r.DivergenciaDecididaPorId, r.DivergenciaDecididaEm, r.AnonimizadoEm,
  COALESCE(m.Nome, r.VisitanteNome) AS CriancaNome, COALESCE(tm.Nome, r.TrouxeNome) AS TrouxeNomeResolvido, COALESCE(rm.Nome, r.RetiradoNome) AS RetiradoNomeResolvido`;
const JUNCOES_REGISTRO = `FROM CheckinInfantilRegistros r
  LEFT JOIN MembroReferencia m ON m.MembroId = r.MenorMembroId
  LEFT JOIN MembroReferencia tm ON tm.MembroId = r.TrouxeMembroId
  LEFT JOIN MembroReferencia rm ON rm.MembroId = r.RetiradoMembroId`;

// visao: 'OPERADOR' (a equipe da sala) ou 'GESTOR' (a liderança: vê também o telefone de quem trouxe e quem decide as divergências).
async function snapshotDaSala(pool, sala, { hoje = hojeBrasilia(), agoraIso = ck.agoraBrasiliaIso(), visao = "OPERADOR" } = {}) {
  const prazos = await lerPrazos(pool);
  const params = await parametrosDaProporcao(pool, sala);
  const lista = await presentes(exec(pool), sala, { hoje, pool });
  const regs = (await pool.request().input("s", sql.Int, sala.servicoId).input("e", sql.Int, sala.equipeId).query(`
    SELECT ${COLUNAS_REGISTRO} ${JUNCOES_REGISTRO} WHERE r.ServicoId = @s AND r.EquipeId = @e AND r.Situacao <> 'RETIRADA' ORDER BY r.RegistroId`)).recordset;
  const autorizados = await carregarAutorizados(pool, regs, { hoje });
  const agora = Date.now();
  const vias = regs.length ? (await (async () => {
    const rq = pool.request();
    return rq.query(`SELECT ViaId, RegistroId, PedidaPorMembroId, PedidaEm, PessoaTipo, PessoaNome FROM CheckinInfantilSegundasVias WHERE RegistroId IN (${listaIn(rq, "r", regs.map((x) => Number(x.RegistroId)))}) AND ConfirmadaEm IS NULL AND CanceladaEm IS NULL`);
  })()).recordset : [];
  const viaPorRegistro = new Map(vias.map((v) => [Number(v.RegistroId), v]));
  const totais = (await pool.request().input("s", sql.Int, sala.servicoId).input("e", sql.Int, sala.equipeId)
    .query(`SELECT COUNT(*) AS entregues, SUM(CASE WHEN Situacao = 'RETIRADA' THEN 1 ELSE 0 END) AS retiradas FROM CheckinInfantilRegistros WHERE ServicoId = @s AND EquipeId = @e`)).recordset[0] || {};
  const adultos = lista.filter((x) => x.contaComoAdulto).length;
  const lotacao = ck.avaliarLotacao({ adultos, criancas: regs.length, adicionar: 0, faixa: sala.faixa, criancasPorAdulto: params.criancasPorAdulto, adultosMinimos: params.adultosMinimos });
  const janela = ck.avaliarJanela({ servicoIso: sala.dataHora, agoraIso, antesMin: prazos.abreMinutosAntes, depoisHoras: prazos.fechaHorasDepois });
  const criancas = regs.map((r) => {
    const via = viaPorRegistro.get(Number(r.RegistroId));
    const viaValida = via && (agora - new Date(via.PedidaEm).getTime()) < ck.SEGUNDA_VIA_MINUTOS * 60000;
    const c = {
      registroId: Number(r.RegistroId), nome: r.CriancaNome, tipo: r.MenorMembroId ? "MEMBRO" : "VISITANTE", idade: r.IdadeAnos, foraDaFaixa: !!r.IdadeForaDaFaixa,
      entregueEm: iso(r.EntregueEm), situacao: r.Situacao, rotuloSituacao: ck.SITUACOES[r.Situacao], travado: !!r.Travado,
      tentativasRestantes: Math.max(0, prazos.tentativasCodigo - Number(r.Tentativas)), saude: r.SaudeTexto || null,
      quemTrouxe: { nome: r.TrouxeNomeResolvido || null, parentesco: r.TrouxeParentesco || null },
      quemPodeRetirar: (autorizados.get(Number(r.RegistroId)) || []).map((a) => ({ ref: a.ref, tipo: a.tipo, nome: a.nome, rotulo: a.rotulo })),
      segundaViaPendente: viaValida ? { viaId: Number(via.ViaId), pedidaEm: iso(via.PedidaEm), pedidaPorMembroId: Number(via.PedidaPorMembroId), pessoaNome: via.PessoaNome || null } : null,
      divergencia: r.Situacao === "RETIRADA_PENDENTE" ? { pedidaEm: iso(r.DivergenciaPedidaEm), quem: { nome: r.RetiradoNomeResolvido || null, parentesco: r.RetiradoParentesco || null, documento: r.RetiradoDocumento || null }, pedidaPorMembroId: Number(r.RetiradoPorOperadorId) } : null
    };
    if (visao === "GESTOR") c.telefoneDeQuemTrouxe = r.TrouxeContato || null;
    return c;
  });
  if (visao === "GESTOR") {
    // O telefone cadastrado dos responsáveis só vai para a liderança: é com ele que ela confirma uma retirada divergente.
    const membros = idsValidos(regs.filter((r) => r.MenorMembroId).map((r) => r.MenorMembroId));
    if (membros.length) {
      const rq = pool.request();
      const resp = (await rq.query(`SELECT r.MenorMembroId, p.Nome, p.Telefone FROM VoluntariadoResponsaveis r JOIN MembroReferencia p ON p.MembroId = r.ResponsavelMembroId
        WHERE r.MenorMembroId IN (${listaIn(rq, "m", membros)}) AND r.RevogadoEm IS NULL ORDER BY r.ResponsavelId`)).recordset;
      for (const c of criancas) {
        const reg = regs.find((x) => Number(x.RegistroId) === c.registroId);
        if (reg && reg.MenorMembroId) c.responsaveisParaContato = resp.filter((x) => Number(x.MenorMembroId) === Number(reg.MenorMembroId)).map((x) => ({ nome: x.Nome, telefone: x.Telefone || null }));
      }
    }
  }
  return {
    sala: { ...sala, janela }, adultosPresentes: lista, lotacao, criancas,
    totais: { entregues: Number(totais.entregues || 0), retiradas: Number(totais.retiradas || 0), naSala: regs.length },
    pendencias: { divergencias: criancas.filter((c) => c.divergencia).length, segundasVias: criancas.filter((c) => c.segundaViaPendente).length, travadas: criancas.filter((c) => c.travado).length },
    atualizadoEm: new Date().toISOString()
  };
}

// As salas de hoje de quem consulta: as que ele opera (escalado ou líder) e, para a liderança, as da congregação dentro do escopo.
// `gestorPodeVer(congregacaoNome)`: função da rota (o escopo da liderança é por nome de congregação); sem ela, só as salas que a pessoa opera.
async function minhasSalas(pool, { membroId, gestorPodeVer = null, hoje = hojeBrasilia(), agoraIso = ck.agoraBrasiliaIso() }) {
  const rq = pool.request().input("m", sql.Int, Number(membroId)).input("hoje", sql.Date, hoje);
  const linhas = (await rq.query(`
    SELECT DISTINCT s.ServicoId, s.DataHora, s.Descricao, s.Status AS ServicoStatus, e.EquipeId, e.Nome AS EquipeNome, e.FaixaEtariaMenores, e.LiderMembroId, e.CongregacaoId, c.Nome AS CongregacaoNome,
           CASE WHEN e.LiderMembroId = @m OR EXISTS (SELECT 1 FROM EscalasAlocacoes a WHERE a.ServicoId = s.ServicoId AND a.EquipeId = e.EquipeId AND a.MembroId = @m AND a.Status IN (${STATUS_ESCALADO_SQL})) THEN 1 ELSE 0 END AS Meu
    FROM EscalasServicos s
    JOIN EscalasEquipes e ON e.CongregacaoId = s.CongregacaoId
    JOIN Congregacoes c ON c.CongregacaoId = e.CongregacaoId
    WHERE CAST(s.DataHora AS DATE) = @hoje
      AND ((s.Status = 'PUBLICADA' AND e.ContatoComMenores = 1 AND e.Ativa = 1
            AND (EXISTS (SELECT 1 FROM EscalasAlocacoes a WHERE a.ServicoId = s.ServicoId AND a.EquipeId = e.EquipeId AND a.Status IN (${STATUS_ESCALADO_SQL}))
                 OR EXISTS (SELECT 1 FROM MinisterioMenoresSalas sa WHERE sa.ServicoId = s.ServicoId AND sa.EquipeId = e.EquipeId)))
           -- a sala com criança ou voluntário DENTRO continua na lista mesmo que a equipe tenha perdido a marca, tenha sido desativada ou o serviço tenha sido cancelado no meio do culto
           OR EXISTS (SELECT 1 FROM CheckinInfantilRegistros r WHERE r.ServicoId = s.ServicoId AND r.EquipeId = e.EquipeId AND r.Situacao <> 'RETIRADA')
           OR EXISTS (SELECT 1 FROM CheckinInfantilVoluntarios v WHERE v.ServicoId = s.ServicoId AND v.EquipeId = e.EquipeId AND v.SaiuEm IS NULL))
    ORDER BY s.DataHora, e.Nome`)).recordset;
  const prazos = await lerPrazos(pool);
  const saida = [];
  for (const x of linhas) {
    const meu = !!x.Meu;
    const gestao = !!gestorPodeVer && !!gestorPodeVer(x.CongregacaoNome);
    if (!meu && !gestao) continue;
    const janela = ck.avaliarJanela({ servicoIso: iso(x.DataHora), agoraIso, antesMin: prazos.abreMinutosAntes, depoisHoras: prazos.fechaHorasDepois });
    const n = (await pool.request().input("s", sql.Int, x.ServicoId).input("e", sql.Int, x.EquipeId)
      .query(`SELECT (SELECT COUNT(*) FROM CheckinInfantilRegistros WHERE ServicoId = @s AND EquipeId = @e AND Situacao <> 'RETIRADA') AS criancas,
                     (SELECT COUNT(*) FROM CheckinInfantilVoluntarios WHERE ServicoId = @s AND EquipeId = @e AND SaiuEm IS NULL) AS voluntarios`)).recordset[0] || {};
    saida.push({ servicoId: x.ServicoId, equipeId: x.EquipeId, equipeNome: x.EquipeNome, faixa: x.FaixaEtariaMenores || null, congregacaoId: x.CongregacaoId, congregacaoNome: x.CongregacaoNome,
      dataHora: iso(x.DataHora), descricao: x.Descricao || null, janela, ehMinha: meu, ehGestao: gestao, criancasNaSala: Number(n.criancas), voluntariosNaSala: Number(n.voluntarios) });
  }
  return saida;
}

// ---------------------------------------------------------------
// Busca de criança membro (só da congregação da sala, poucos resultados)
// ---------------------------------------------------------------

async function buscarCriancas(pool, { sala, termo, hoje = hojeBrasilia() }) {
  const t = String(termo == null ? "" : termo).trim();
  if (t.length < 3 || t.length > 60 || /[<>%_\[\]]/.test(t)) return { sucesso: false, mensagem: "Digite ao menos 3 letras do nome da criança." };
  const r = (await pool.request().input("c", sql.Int, sala.congregacaoId).input("hoje", sql.Date, hoje).input("t", sql.NVarChar(80), `%${t}%`).query(`
    SELECT TOP 8 m.MembroId, m.Nome, m.DataNascimento,
           (SELECT COUNT(*) FROM VoluntariadoResponsaveis v WHERE v.MenorMembroId = m.MembroId AND v.RevogadoEm IS NULL) AS Responsaveis,
           CASE WHEN EXISTS (SELECT 1 FROM CheckinInfantilRegistros x WHERE x.MenorMembroId = m.MembroId AND x.Situacao <> 'RETIRADA') THEN 1 ELSE 0 END AS JaNaSala
    FROM MembroReferencia m
    WHERE m.CongregacaoId = @c AND m.DataNascimento IS NOT NULL AND m.DataNascimento > DATEADD(YEAR, -18, @hoje) AND m.DataNascimento <= @hoje AND m.Nome LIKE @t
    ORDER BY m.Nome`)).recordset;
  return {
    sucesso: true,
    criancas: r.map((m) => {
      const idade = vol.idadeEmAnos(m.DataNascimento, hoje);
      return { menorId: Number(m.MembroId), nome: m.Nome, idade, faixa: ck.faixaDaIdade(idade), foraDaFaixa: ck.idadeForaDaFaixa(idade, sala.faixa), temResponsavel: Number(m.Responsaveis) > 0, jaNaSala: !!m.JaNaSala };
    })
  };
}

// Os responsáveis cadastrados de uma criança membro (para a tela escolher "quem trouxe").
async function responsaveisDaCrianca(pool, { sala, menorId }) {
  const m = (await pool.request().input("m", sql.Int, menorId).input("c", sql.Int, sala.congregacaoId).query(`SELECT MembroId FROM MembroReferencia WHERE MembroId = @m AND CongregacaoId = @c`)).recordset[0];
  if (!m) return { sucesso: false, naoAchou: true, mensagem: ck.MENSAGENS.CRIANCA_NAO_ACHADA };
  const resp = (await pool.request().input("m", sql.Int, menorId).query(`SELECT r.ResponsavelMembroId, r.Vinculo, p.Nome FROM VoluntariadoResponsaveis r JOIN MembroReferencia p ON p.MembroId = r.ResponsavelMembroId WHERE r.MenorMembroId = @m AND r.RevogadoEm IS NULL ORDER BY r.ResponsavelId`)).recordset;
  return { sucesso: true, responsaveis: resp.map((x) => ({ membroId: Number(x.ResponsavelMembroId), nome: x.Nome, vinculo: x.Vinculo, rotuloVinculo: vol.VINCULOS_RESPONSAVEL[x.Vinculo] || null })) };
}

// ---------------------------------------------------------------
// Check-in
// ---------------------------------------------------------------

// A saúde de uma criança membro só vale se o consentimento de saúde da v7.7 está VIGENTE agora (a leitura nunca depende de lembrar de apagar).
async function saudeVigenteDosMenores(pool, menorIds, hoje) {
  const ids = idsValidos(menorIds);
  const mapa = new Map();
  if (!ids.length) return mapa;
  const rq = pool.request();
  const linhas = (await rq.query(`SELECT MenorMembroId, Texto FROM CheckinInfantilSaude WHERE MenorMembroId IN (${listaIn(rq, "m", ids)})`)).recordset;
  for (const l of linhas) {
    if (await mcDb.consentimentoVigente(pool, Number(l.MenorMembroId), "SAUDE_CRACHA", { hoje })) mapa.set(Number(l.MenorMembroId), l.Texto);
  }
  return mapa;
}

// `dados`: já validado por ck.validarCheckin. Devolve, por criança, a etiqueta (com o código, que só aparece AQUI) e o recibo do responsável.
async function fazerCheckin(pool, { sala, operadorId, dados, hoje = hojeBrasilia(), agoraIso = ck.agoraBrasiliaIso() }) {
  if (sala.servicoStatus !== "PUBLICADA") return { sucesso: false, mensagem: ck.MENSAGENS.SERVICO_NAO_PUBLICADO };
  if (sala.equipeAtiva === false) return { sucesso: false, mensagem: ck.MENSAGENS.EQUIPE_DESATIVADA };
  const prazos = await lerPrazos(pool);
  const janela = ck.avaliarJanela({ servicoIso: sala.dataHora, agoraIso, antesMin: prazos.abreMinutosAntes, depoisHoras: prazos.fechaHorasDepois });
  if (!janela.aberta) return { sucesso: false, mensagem: janela.mensagem };
  const op = await conferirOperador(pool, sala, operadorId, { hoje });
  if (!op.sucesso) return op;

  // As crianças membro: existem, têm idade conhecida abaixo de 18 e não estão em outra sala.
  const idsMembros = dados.criancas.filter((c) => c.tipo === "MEMBRO").map((c) => c.menorId);
  // O responsável cadastrado (responsavelId) só tem o que conferir quando há criança MEMBRO no pedido (cada uma tem de ter essa pessoa como responsável). Sem criança membro, aceitar a
  // matrícula deixava o operador registrar QUALQUER membro como "quem trouxe" um visitante (e esse membro passava a poder retirá-lo), e a resposta diferente para matrícula que existe e que
  // não existe virava sonda de matrículas (achado na prova no banco real, e2e-20).
  if (dados.trouxe.membroId && !idsMembros.length) return { sucesso: false, mensagem: ck.MENSAGENS.RESPONSAVEL_SO_DE_MEMBRO };
  const membros = new Map();
  if (idsMembros.length) {
    const rq = pool.request();
    const linhas = (await rq.query(`SELECT MembroId, Nome, DataNascimento, CongregacaoId FROM MembroReferencia WHERE MembroId IN (${listaIn(rq, "m", idsMembros)})`)).recordset;
    for (const l of linhas) membros.set(Number(l.MembroId), l);
  }
  const resp = new Map();
  if (idsMembros.length) {
    const rq = pool.request();
    const linhas = (await rq.query(`SELECT MenorMembroId, ResponsavelMembroId FROM VoluntariadoResponsaveis WHERE MenorMembroId IN (${listaIn(rq, "m", idsMembros)}) AND RevogadoEm IS NULL`)).recordset;
    for (const l of linhas) { if (!resp.has(Number(l.MenorMembroId))) resp.set(Number(l.MenorMembroId), new Set()); resp.get(Number(l.MenorMembroId)).add(Number(l.ResponsavelMembroId)); }
  }
  const preparadas = [];
  for (const c of dados.criancas) {
    if (c.tipo === "MEMBRO") {
      const m = membros.get(c.menorId);
      // Criança que não existe e criança de outra congregação recebem a mesma resposta (a busca é só da congregação da sala).
      if (!m || Number(m.CongregacaoId) !== Number(sala.congregacaoId)) return { sucesso: false, mensagem: ck.MENSAGENS.CRIANCA_NAO_ACHADA };
      const idade = vol.idadeEmAnos(m.DataNascimento, hoje);
      if (idade == null) return { sucesso: false, mensagem: `${m.Nome}: ${ck.MENSAGENS.SEM_NASCIMENTO}` };
      if (idade >= vol.MAIORIDADE) return { sucesso: false, mensagem: `${m.Nome}: ${ck.MENSAGENS.NAO_E_MENOR}` };
      if (dados.trouxe.membroId && !(resp.get(c.menorId) || new Set()).has(Number(dados.trouxe.membroId))) {
        return { sucesso: false, mensagem: `${m.Nome}: a pessoa escolhida não é responsável cadastrado desta criança. ${ck.MENSAGENS.SEM_RESPONSAVEL}` };
      }
      preparadas.push({ ...c, nome: m.Nome, idade });
    } else {
      preparadas.push({ ...c, nome: c.nome });
    }
  }
  const saudeMembros = await saudeVigenteDosMenores(pool, idsMembros, hoje);
  for (const c of preparadas) {
    if (c.tipo === "VISITANTE" && c.saude && !mc.hashConfere("SAUDE_CRACHA", c.saude.textoHash)) {
      return { sucesso: false, termoMudou: true, mensagem: "O texto da autorização de saúde mudou desde que a tela foi aberta: recarregue a tela e peça ao responsável para ler de novo." };
    }
  }
  // Quem trouxe: membro (responsável cadastrado) ou nome livre. O nome do membro vem do banco, nunca do cliente.
  let trouxeNomeMembro = null;
  if (dados.trouxe.membroId) {
    const t = (await pool.request().input("m", sql.Int, dados.trouxe.membroId).query(`SELECT Nome FROM MembroReferencia WHERE MembroId = @m`)).recordset[0];
    if (!t) return { sucesso: false, mensagem: "Quem trouxe a criança não foi encontrado." };
    trouxeNomeMembro = t.Nome;
  }

  const params = await parametrosDaProporcao(pool, sala);
  const transaction = new sql.Transaction(pool);
  await transaction.begin();
  const criados = [];
  try {
    if (!(await obterTrava(execTx(transaction), `checkin-sala:${sala.servicoId}:${sala.equipeId}`))) { await fecharTransacao(transaction, false); return { sucesso: false, mensagem: "A sala está ocupada com outra operação. Tente de novo em instantes." }; }
    const lista = await presentes(execTx(transaction), sala, { hoje, pool });
    const criancasAgora = await contarCriancasNaSala(execTx(transaction), sala);
    const adultos = lista.filter((x) => x.contaComoAdulto).length;
    const lot = ck.avaliarLotacao({ adultos, criancas: criancasAgora, adicionar: preparadas.length, faixa: sala.faixa, criancasPorAdulto: params.criancasPorAdulto, adultosMinimos: params.adultosMinimos });
    if (!lot.ok) {
      await registrarEvento(execTx(transaction), { servicoId: sala.servicoId, equipeId: sala.equipeId, tipo: "SALA_RECUSOU_CHECKIN", atorId: Number(operadorId), detalhe: `${lot.problemas[0].codigo};adultos=${adultos};criancas=${criancasAgora}`.slice(0, 100) });
      await transaction.commit();
      return { sucesso: false, lotacao: lot, mensagem: lot.problemas[0].mensagem };
    }
    for (const c of preparadas) {
      const foraDaFaixa = ck.idadeForaDaFaixa(c.idade, sala.faixa);
      let saudeTexto = null, saudeOrigem = null, saudeVersao = null, saudeHash = null;
      if (c.tipo === "MEMBRO" && saudeMembros.has(c.menorId)) { saudeTexto = saudeMembros.get(c.menorId); saudeOrigem = "CADASTRO"; }
      if (c.tipo === "VISITANTE" && c.saude) { saudeTexto = c.saude.texto; saudeOrigem = "BALCAO"; saudeVersao = mc.textoDe("SAUDE_CRACHA").versao; saudeHash = c.saude.textoHash; }
      const codigo = ck.gerarCodigo();
      let registroId;
      try {
        const r = await new sql.Request(transaction)
          .input("s", sql.Int, sala.servicoId).input("e", sql.Int, sala.equipeId).input("c", sql.Int, sala.congregacaoId)
          .input("mn", sql.Int, c.tipo === "MEMBRO" ? c.menorId : null).input("vn", sql.NVarChar(150), c.tipo === "VISITANTE" ? c.nome : null).input("vd", sql.Date, c.tipo === "VISITANTE" ? c.nascimento : null)
          .input("idade", sql.Int, c.idade).input("faixa", sql.NVarChar(12), sala.faixa).input("fora", sql.Bit, foraDaFaixa ? 1 : 0)
          .input("tm", sql.Int, dados.trouxe.membroId || null).input("tn", sql.NVarChar(150), dados.trouxe.membroId ? null : dados.trouxe.nome).input("tp", sql.NVarChar(20), dados.trouxe.parentesco || null)
          .input("tc", sql.NVarChar(30), dados.trouxe.contato || null).input("td", sql.NVarChar(10), dados.trouxe.documento || null)
          .input("st", sql.NVarChar(400), saudeTexto).input("so", sql.NVarChar(10), saudeOrigem).input("sv", sql.Int, saudeVersao).input("sh", sql.NVarChar(64), saudeHash)
          .input("por", sql.Int, Number(operadorId))
          .query(`INSERT INTO CheckinInfantilRegistros (ServicoId, EquipeId, CongregacaoId, MenorMembroId, VisitanteNome, VisitanteNascimento, IdadeAnos, FaixaSala, IdadeForaDaFaixa,
                    TrouxeMembroId, TrouxeNome, TrouxeParentesco, TrouxeContato, TrouxeDocumento, SaudeTexto, SaudeOrigem, SaudeTextoVersao, SaudeTextoHash, CodigoHash, EntreguePorMembroId)
                  OUTPUT INSERTED.RegistroId
                  VALUES (@s, @e, @c, @mn, @vn, @vd, @idade, @faixa, @fora, @tm, @tn, @tp, @tc, @td, @st, @so, @sv, @sh, REPLICATE('0', 64), @por)`);
        registroId = Number(r.recordset[0].RegistroId);
      } catch (e) {
        if (duplicado(e)) { await fecharTransacao(transaction, false); return { sucesso: false, mensagem: `${c.nome}: ${ck.MENSAGENS.JA_NA_SALA}` }; }
        throw e;
      }
      const hash = ck.hashCodigo(codigo, { registroId, geracao: 1, segredo: segredo() });
      await new sql.Request(transaction).input("r", sql.Int, registroId).input("h", sql.NVarChar(64), hash).query(`UPDATE CheckinInfantilRegistros SET CodigoHash = @h WHERE RegistroId = @r`);
      for (const x of dados.extras) {
        await new sql.Request(transaction).input("r", sql.Int, registroId).input("n", sql.NVarChar(150), x.nome).input("p", sql.NVarChar(20), x.parentesco)
          .query(`INSERT INTO CheckinInfantilAutorizadosVisita (RegistroId, Nome, Parentesco) VALUES (@r, @n, @p)`);
      }
      await registrarEvento(execTx(transaction), { registroId, servicoId: sala.servicoId, equipeId: sala.equipeId, tipo: "CHECKIN", atorId: Number(operadorId), detalhe: `adultos=${adultos};criancas=${criancasAgora + criados.length + 1}`.slice(0, 100) });
      criados.push({ registroId, c, codigo, foraDaFaixa, saudeTexto });
    }
    await transaction.commit();
  } catch (e) { await fecharTransacao(transaction, false); throw e; }

  for (const x of criados) {
    await registrarAuditoria({ tabela: "CheckinInfantilRegistros", registroId: x.registroId, acao: "CHECKIN_INFANTIL_ENTREGA", usuarioId: Number(operadorId), dadosDepois: { servicoId: sala.servicoId, equipeId: sala.equipeId, tipo: x.c.tipo } });
  }
  const instante = new Date().toISOString();
  const etiquetas = criados.map((x) => ({
    registroId: x.registroId, foraDaFaixa: x.foraDaFaixa,
    etiqueta: ck.montarEtiqueta({ nomeCrianca: x.c.nome, idade: x.c.idade, salaNome: sala.equipeNome, congregacaoNome: sala.congregacaoNome, codigo: x.codigo, saudeTexto: x.saudeTexto, instante })
  }));
  return {
    sucesso: true, mensagem: criados.length === 1 ? "Criança entregue na sala." : `${criados.length} crianças entregues na sala.`,
    etiquetas,
    recibo: {
      sala: sala.equipeNome, congregacao: sala.congregacaoNome, instante, trouxe: trouxeNomeMembro || dados.trouxe.nome,
      criancas: etiquetas.map((e) => ({ nome: e.etiqueta.nome, codigo: e.etiqueta.codigo })),
      orientacao: "Apresente o código na hora de retirar. Sem o código a criança não é entregue, mesmo a quem a equipe conhece."
    }
  };
}

// ---------------------------------------------------------------
// Retirada
// ---------------------------------------------------------------

async function lerRegistro(pool, registroId) {
  const r = (await pool.request().input("r", sql.Int, registroId).query(`SELECT ${COLUNAS_REGISTRO}, r.CodigoHash ${JUNCOES_REGISTRO} WHERE r.RegistroId = @r`)).recordset[0];
  return r || null;
}

// Quem pode ver/operar este registro: a sala dele. Devolve o contexto da sala (para a rota conferir o operador) e o registro.
async function registroComSala(pool, registroId) {
  const reg = await lerRegistro(pool, registroId);
  if (!reg) return { sucesso: false, naoAchou: true, mensagem: ck.MENSAGENS.CRIANCA_NAO_ACHADA };
  const c = await contextoDaSala(pool, { servicoId: reg.ServicoId, equipeId: reg.EquipeId }, { exigirMarca: false });      // a criança que já está na sala sai mesmo sem a marca
  if (!c.sucesso) return c;
  return { sucesso: true, registro: reg, sala: c.sala };
}

// Reserva UMA tentativa antes de conferir o código: o UPDATE só passa enquanto a criança não está travada e ainda tem tentativas; o contador sobe no mesmo comando.
// Em paralelo, no máximo `max` conferências acontecem, não importa quantas requisições cheguem.
// Achado na prova no banco real: a tabela tem gatilho (TR_CheckinRegistros_Protegido), e o SQL Server NÃO aceita "UPDATE ... OUTPUT" sem "INTO" numa tabela com gatilho (erro 334):
// com o OUTPUT solto toda retirada com código dava erro 500. O OUTPUT vai para uma variável de tabela e o SELECT devolve o que a reserva leu.
async function reservarTentativa(pool, { registroId, max }) {
  const r = await pool.request().input("r", sql.Int, registroId).input("max", sql.Int, max).query(`
    DECLARE @reservada TABLE (tentativas INT, hash NVARCHAR(64), geracao INT);
    UPDATE CheckinInfantilRegistros SET Tentativas = Tentativas + 1
    OUTPUT INSERTED.Tentativas, INSERTED.CodigoHash, INSERTED.CodigoGeracao INTO @reservada (tentativas, hash, geracao)
    WHERE RegistroId = @r AND Situacao = 'NA_SALA' AND Travado = 0 AND Tentativas < @max;
    SELECT tentativas, hash, geracao FROM @reservada`);
  return r.recordset[0] || null;
}

async function listaDeInteressados(pool, registro, sala) {
  // quem recebe o aviso: os responsáveis cadastrados da criança (com o primeiro nome dela), o líder da sala e a gestão da congregação (sem nome de criança)
  const pais = registro.MenorMembroId
    ? (await pool.request().input("m", sql.Int, Number(registro.MenorMembroId)).query(`SELECT p.MembroId, p.Nome, p.Email FROM VoluntariadoResponsaveis r JOIN MembroReferencia p ON p.MembroId = r.ResponsavelMembroId WHERE r.MenorMembroId = @m AND r.RevogadoEm IS NULL`)).recordset
        .map((p) => ({ membroId: Number(p.MembroId), nome: p.Nome, email: p.Email }))
    : [];
  const lider = sala.liderMembroId ? await pool.request().input("m", sql.Int, sala.liderMembroId).query(`SELECT MembroId, Nome, Email FROM MembroReferencia WHERE MembroId = @m`).then((r) => r.recordset.map((p) => ({ membroId: Number(p.MembroId), nome: p.Nome, email: p.Email }))) : [];
  const gestao = (await require("./psc").resolverDestinatariosDaCongregacao(pool, { permissao: "habilitacao_voluntarios", congregacaoId: sala.congregacaoId })).map((d) => ({ membroId: d.membroId, nome: d.nome, email: d.email }));
  return { pais, gestao: [...new Map([...lider, ...gestao].map((d) => [d.membroId, d])).values()] };
}

async function retirar(pool, { sala, registroId, operadorId, dados, hoje = hojeBrasilia(), deps = {} }) {
  const op = await conferirOperador(pool, sala, operadorId, { hoje });
  if (!op.sucesso) return op;
  const prazos = await lerPrazos(pool);
  const reg0 = await lerRegistro(pool, registroId);
  if (!reg0 || Number(reg0.ServicoId) !== sala.servicoId || Number(reg0.EquipeId) !== sala.equipeId) return { sucesso: false, naoAchou: true, mensagem: ck.MENSAGENS.CRIANCA_NAO_ACHADA };
  if (reg0.Situacao === "RETIRADA") return { sucesso: false, mensagem: ck.MENSAGENS.JA_RETIRADA };
  if (reg0.Situacao === "RETIRADA_PENDENTE") return { sucesso: false, mensagem: "Já há um pedido de retirada aguardando a aprovação da liderança para esta criança." };
  if (reg0.Travado) return { sucesso: false, travada: true, mensagem: ck.MENSAGENS.CRIANCA_TRAVADA };

  // 1) quem está retirando, conferido contra a lista (antes de gastar uma tentativa: escolher errado na tela não conta como erro de código)
  const autorizados = (await carregarAutorizados(pool, [reg0], { hoje })).get(Number(registroId)) || [];
  const quem = ck.classificarRetirante(dados.retirante, autorizados);
  if (quem.erro) return { sucesso: false, mensagem: quem.erro };

  // 2) a tentativa é reservada ANTES de conferir
  const t = await reservarTentativa(pool, { registroId, max: prazos.tentativasCodigo });
  if (!t) {
    const atual = await lerRegistro(pool, registroId);
    if (atual && atual.Travado) return { sucesso: false, travada: true, mensagem: ck.MENSAGENS.CRIANCA_TRAVADA };
    return { sucesso: false, mudou: true, mensagem: ck.MENSAGENS.MUDOU };
  }
  const certo = ck.confereCodigo(dados.codigo, t.hash, { registroId, geracao: Number(t.geracao), segredo: segredo() });
  if (!certo) {
    const tentativas = Number(t.tentativas);
    await registrarEvento(exec(pool), { registroId, servicoId: sala.servicoId, equipeId: sala.equipeId, tipo: "CODIGO_ERRADO", atorId: Number(operadorId), detalhe: `tentativa=${tentativas}/${prazos.tentativasCodigo}` });
    if (tentativas >= prazos.tentativasCodigo) {
      await pool.request().input("r", sql.Int, registroId).query(`UPDATE CheckinInfantilRegistros SET Travado = 1 WHERE RegistroId = @r AND Situacao = 'NA_SALA'`);
      await registrarEvento(exec(pool), { registroId, servicoId: sala.servicoId, equipeId: sala.equipeId, tipo: "CRIANCA_TRAVADA", atorId: Number(operadorId), detalhe: `erros=${tentativas}` });
      return { sucesso: false, codigoErrado: true, travada: true, mensagem: `Código errado. A criança foi travada depois de ${prazos.tentativasCodigo} erros: peça à liderança para destravar ou emita a segunda via.` };
    }
    return { sucesso: false, codigoErrado: true, tentativasRestantes: prazos.tentativasCodigo - tentativas, mensagem: `${ck.MENSAGENS.CODIGO_ERRADO} Restam ${prazos.tentativasCodigo - tentativas} tentativa(s).` };
  }

  // 3) código certo: quem está na lista sai; quem não está fica aguardando a liderança
  const tipoBanco = quem.tipo;
  if (!quem.divergente) {
    const r = await pool.request().input("r", sql.Int, registroId).input("g", sql.Int, Number(t.geracao)).input("tp", sql.NVarChar(12), tipoBanco)
      .input("mm", sql.Int, quem.membroId).input("nm", sql.NVarChar(150), quem.membroId ? null : quem.nome).input("op", sql.Int, Number(operadorId))
      .query(`UPDATE CheckinInfantilRegistros SET Situacao = 'RETIRADA', RetiradoEm = SYSUTCDATETIME(), RetiradoTipo = @tp, RetiradoMembroId = @mm, RetiradoNome = @nm, RetiradoPorOperadorId = @op, Tentativas = 0
              WHERE RegistroId = @r AND Situacao = 'NA_SALA' AND Travado = 0 AND CodigoGeracao = @g; SELECT @@ROWCOUNT AS n`);
    if (Number(r.recordset[0].n) !== 1) return { sucesso: false, mudou: true, mensagem: ck.MENSAGENS.MUDOU };
    await registrarEvento(exec(pool), { registroId, servicoId: sala.servicoId, equipeId: sala.equipeId, tipo: "RETIRADA", atorId: Number(operadorId), detalhe: tipoBanco });
    await registrarAuditoria({ tabela: "CheckinInfantilRegistros", registroId: Number(registroId), acao: "CHECKIN_INFANTIL_RETIRADA", usuarioId: Number(operadorId), dadosDepois: { servicoId: sala.servicoId, equipeId: sala.equipeId, tipo: tipoBanco } });
    return { sucesso: true, retirada: true, mensagem: "Criança entregue a quem a retirou." };
  }
  const r = await pool.request().input("r", sql.Int, registroId).input("g", sql.Int, Number(t.geracao)).input("nm", sql.NVarChar(150), quem.nome).input("pa", sql.NVarChar(20), quem.parentesco)
    .input("dc", sql.NVarChar(10), quem.documento).input("op", sql.Int, Number(operadorId))
    .query(`UPDATE CheckinInfantilRegistros SET Situacao = 'RETIRADA_PENDENTE', RetiradoTipo = 'OUTRO', RetiradoMembroId = NULL, RetiradoNome = @nm, RetiradoParentesco = @pa, RetiradoDocumento = @dc,
                   RetiradoPorOperadorId = @op, Divergente = 1, DivergenciaPedidaEm = SYSUTCDATETIME(), Tentativas = 0
            WHERE RegistroId = @r AND Situacao = 'NA_SALA' AND Travado = 0 AND CodigoGeracao = @g; SELECT @@ROWCOUNT AS n`);
  if (Number(r.recordset[0].n) !== 1) return { sucesso: false, mudou: true, mensagem: ck.MENSAGENS.MUDOU };
  await registrarEvento(exec(pool), { registroId, servicoId: sala.servicoId, equipeId: sala.equipeId, tipo: "RETIRADA_DIVERGENTE_PEDIDA", atorId: Number(operadorId) });
  const ev = (await pool.request().input("r", sql.Int, registroId).query(`SELECT TOP 1 EventoId FROM CheckinInfantilEventos WHERE RegistroId = @r AND Tipo = 'RETIRADA_DIVERGENTE_PEDIDA' ORDER BY EventoId DESC`)).recordset[0];
  await registrarAuditoria({ tabela: "CheckinInfantilRegistros", registroId: Number(registroId), acao: "CHECKIN_INFANTIL_RETIRADA_DIVERGENTE_PEDIDA", usuarioId: Number(operadorId), dadosDepois: { servicoId: sala.servicoId, equipeId: sala.equipeId } });
  const interessados = await listaDeInteressados(pool, reg0, sala);
  const ref = ev ? Number(ev.EventoId) : Number(registroId);
  await (deps.notificarAgora || notificarAgora)(pool, { regraChave: "CHECKIN_RETIRADA_DIVERGENTE", destinatarios: interessados.pais, mensagem: ck.textoRetiradaDivergentePais({ nomeCrianca: reg0.CriancaNome, salaNome: sala.equipeNome }),
    referenciaId: ref, referenciaTabela: "CheckinInfantilEventos", aguardarEntrega: false });
  await (deps.notificarAgora || notificarAgora)(pool, { regraChave: "CHECKIN_RETIRADA_DIVERGENTE", destinatarios: interessados.gestao.filter((g) => !interessados.pais.some((p) => p.membroId === g.membroId)), mensagem: ck.textoRetiradaDivergenteGestao({ salaNome: sala.equipeNome }),
    referenciaId: ref, referenciaTabela: "CheckinInfantilEventos", aguardarEntrega: false });
  return { sucesso: true, divergente: true, aguardaLideranca: true, mensagem: "Quem pediu não está na lista de quem pode retirar esta criança. O pedido foi enviado à liderança da congregação; a criança continua na sala até a aprovação." };
}

// A liderança decide a retirada divergente: confirma com o responsável pelo telefone e aprova ou nega. Quem decide não é quem pediu nem a própria pessoa que retira.
async function decidirDivergencia(pool, { sala, registroId, gestorId, aprovar, motivo }) {
  const reg = await lerRegistro(pool, registroId);
  if (!reg || Number(reg.ServicoId) !== sala.servicoId || Number(reg.EquipeId) !== sala.equipeId) return { sucesso: false, naoAchou: true, mensagem: ck.MENSAGENS.CRIANCA_NAO_ACHADA };
  if (reg.Situacao !== "RETIRADA_PENDENTE") return { sucesso: false, mudou: true, mensagem: "Não há retirada divergente aguardando decisão para esta criança." };
  if (Number(reg.RetiradoPorOperadorId) === Number(gestorId)) return { sucesso: false, proibido: true, mensagem: "Quem registrou o pedido não decide sobre ele: outra pessoa da liderança precisa aprovar ou negar." };
  if (aprovar) {
    const r = await pool.request().input("r", sql.Int, registroId).input("g", sql.Int, Number(gestorId)).input("m", sql.NVarChar(300), motivo)
      .query(`UPDATE CheckinInfantilRegistros SET Situacao = 'RETIRADA', RetiradoEm = SYSUTCDATETIME(), DivergenciaDecididaPorId = @g, DivergenciaDecididaEm = SYSUTCDATETIME(), DivergenciaMotivo = @m
              WHERE RegistroId = @r AND Situacao = 'RETIRADA_PENDENTE'; SELECT @@ROWCOUNT AS n`);
    if (Number(r.recordset[0].n) !== 1) return { sucesso: false, mudou: true, mensagem: ck.MENSAGENS.MUDOU };
    await registrarEvento(exec(pool), { registroId, servicoId: sala.servicoId, equipeId: sala.equipeId, tipo: "RETIRADA_DIVERGENTE_APROVADA", atorId: Number(gestorId) });
    await registrarAuditoria({ tabela: "CheckinInfantilRegistros", registroId: Number(registroId), acao: "CHECKIN_INFANTIL_DIVERGENCIA_APROVADA", usuarioId: Number(gestorId), dadosDepois: { servicoId: sala.servicoId, equipeId: sala.equipeId } });
    return { sucesso: true, aprovada: true, mensagem: "Retirada aprovada: a criança pode ser entregue a quem pediu." };
  }
  const r = await pool.request().input("r", sql.Int, registroId).input("g", sql.Int, Number(gestorId)).input("m", sql.NVarChar(300), motivo)
    .query(`UPDATE CheckinInfantilRegistros SET Situacao = 'NA_SALA', RetiradoTipo = NULL, RetiradoMembroId = NULL, RetiradoNome = NULL, RetiradoParentesco = NULL, RetiradoDocumento = NULL, RetiradoPorOperadorId = NULL,
                   Divergente = 0, DivergenciaPedidaEm = NULL, DivergenciaDecididaPorId = @g, DivergenciaDecididaEm = SYSUTCDATETIME(), DivergenciaMotivo = @m
            WHERE RegistroId = @r AND Situacao = 'RETIRADA_PENDENTE'; SELECT @@ROWCOUNT AS n`);
  if (Number(r.recordset[0].n) !== 1) return { sucesso: false, mudou: true, mensagem: ck.MENSAGENS.MUDOU };
  await registrarEvento(exec(pool), { registroId, servicoId: sala.servicoId, equipeId: sala.equipeId, tipo: "RETIRADA_DIVERGENTE_NEGADA", atorId: Number(gestorId) });
  await registrarAuditoria({ tabela: "CheckinInfantilRegistros", registroId: Number(registroId), acao: "CHECKIN_INFANTIL_DIVERGENCIA_NEGADA", usuarioId: Number(gestorId), dadosDepois: { servicoId: sala.servicoId, equipeId: sala.equipeId } });
  return { sucesso: true, negada: true, mensagem: "Retirada negada: a criança continua na sala. Peça a quem a trouxe, ou a alguém da lista, que a retire com o código." };
}

// A liderança destrava a criança (os erros de código travaram). O código segue o mesmo: quem o perdeu pede a segunda via.
async function destravar(pool, { sala, registroId, gestorId }) {
  const reg = await lerRegistro(pool, registroId);
  if (!reg || Number(reg.ServicoId) !== sala.servicoId || Number(reg.EquipeId) !== sala.equipeId) return { sucesso: false, naoAchou: true, mensagem: ck.MENSAGENS.CRIANCA_NAO_ACHADA };
  const r = await pool.request().input("r", sql.Int, registroId).query(`UPDATE CheckinInfantilRegistros SET Travado = 0, Tentativas = 0 WHERE RegistroId = @r AND Situacao = 'NA_SALA' AND Travado = 1; SELECT @@ROWCOUNT AS n`);
  if (Number(r.recordset[0].n) !== 1) return { sucesso: false, mudou: true, mensagem: "Esta criança não está travada." };
  await registrarEvento(exec(pool), { registroId, servicoId: sala.servicoId, equipeId: sala.equipeId, tipo: "CRIANCA_DESTRAVADA", atorId: Number(gestorId) });
  await registrarAuditoria({ tabela: "CheckinInfantilRegistros", registroId: Number(registroId), acao: "CHECKIN_INFANTIL_DESTRAVADA", usuarioId: Number(gestorId), dadosDepois: { servicoId: sala.servicoId, equipeId: sala.equipeId } });
  return { sucesso: true, mensagem: "Criança destravada: quem tem o código pode retirá-la." };
}

// ---------------------------------------------------------------
// Segunda via do código (dois olhares)
// ---------------------------------------------------------------

async function pedirSegundaVia(pool, { sala, operadorId, dados, hoje = hojeBrasilia() }) {
  const op = await conferirOperador(pool, sala, operadorId, { hoje });
  if (!op.sucesso) return op;
  const reg = await lerRegistro(pool, dados.registroId);
  if (!reg || Number(reg.ServicoId) !== sala.servicoId || Number(reg.EquipeId) !== sala.equipeId) return { sucesso: false, naoAchou: true, mensagem: ck.MENSAGENS.CRIANCA_NAO_ACHADA };
  if (reg.Situacao !== "NA_SALA") return { sucesso: false, mensagem: reg.Situacao === "RETIRADA" ? ck.MENSAGENS.JA_RETIRADA : "Esta criança tem uma retirada aguardando a liderança: a segunda via não se aplica." };
  const autorizados = (await carregarAutorizados(pool, [reg], { hoje })).get(Number(dados.registroId)) || [];
  const ref = dados.pessoa.tipo === "TROUXE" ? "TROUXE" : `${dados.pessoa.tipo}:${dados.pessoa.id}`;
  const pessoa = autorizados.find((a) => a.ref === ref);
  // A segunda via é só para quem está na lista (quem não está passa pela retirada divergente, com a liderança).
  if (!pessoa) return { sucesso: false, mensagem: "Essa pessoa não está na lista de quem pode retirar esta criança: não se emite segunda via para ela. Chame a liderança." };
  const tipoVia = pessoa.tipo;
  try {
    // um pedido anterior que ninguém confirmou em 10 minutos é cancelado (nada se apaga) para abrir um novo
    await pool.request().input("r", sql.Int, dados.registroId).input("min", sql.Int, ck.SEGUNDA_VIA_MINUTOS)
      .query(`UPDATE CheckinInfantilSegundasVias SET CanceladaEm = SYSUTCDATETIME() WHERE RegistroId = @r AND ConfirmadaEm IS NULL AND CanceladaEm IS NULL AND PedidaEm < DATEADD(MINUTE, -@min, SYSUTCDATETIME())`);
    const r = await pool.request().input("r", sql.Int, dados.registroId).input("op", sql.Int, Number(operadorId)).input("tp", sql.NVarChar(12), tipoVia)
      .input("pm", sql.Int, pessoa.membroId || null).input("pn", sql.NVarChar(150), pessoa.membroId ? null : pessoa.nome || null).input("dc", sql.NVarChar(10), dados.documento)
      .query(`INSERT INTO CheckinInfantilSegundasVias (RegistroId, PedidaPorMembroId, PessoaTipo, PessoaMembroId, PessoaNome, Documento) OUTPUT INSERTED.ViaId VALUES (@r, @op, @tp, @pm, @pn, @dc)`);
    await registrarEvento(exec(pool), { registroId: dados.registroId, servicoId: sala.servicoId, equipeId: sala.equipeId, tipo: "SEGUNDA_VIA_PEDIDA", atorId: Number(operadorId) });
    await registrarAuditoria({ tabela: "CheckinInfantilSegundasVias", registroId: Number(r.recordset[0].ViaId), acao: "CHECKIN_INFANTIL_SEGUNDA_VIA_PEDIDA", usuarioId: Number(operadorId), dadosDepois: { servicoId: sala.servicoId, equipeId: sala.equipeId } });
    return { sucesso: true, viaId: Number(r.recordset[0].ViaId), mensagem: `Pedido registrado. Outro adulto da sala precisa confirmar em até ${ck.SEGUNDA_VIA_MINUTOS} minutos (dois olhares).` };
  } catch (e) {
    if (duplicado(e)) return { sucesso: false, mensagem: `Já há um pedido de segunda via aguardando a confirmação de outro adulto da sala (vale ${ck.SEGUNDA_VIA_MINUTOS} minutos).` };
    throw e;
  }
}

// Outro adulto da sala (que não pediu) confirma: o código antigo morre e o novo sai UMA vez, na resposta.
async function confirmarSegundaVia(pool, { sala, operadorId, registroId, hoje = hojeBrasilia(), deps = {} }) {
  const op = await conferirOperador(pool, sala, operadorId, { hoje });
  if (!op.sucesso) return op;
  const reg = await lerRegistro(pool, registroId);
  if (!reg || Number(reg.ServicoId) !== sala.servicoId || Number(reg.EquipeId) !== sala.equipeId) return { sucesso: false, naoAchou: true, mensagem: ck.MENSAGENS.CRIANCA_NAO_ACHADA };
  if (reg.Situacao !== "NA_SALA") return { sucesso: false, mudou: true, mensagem: ck.MENSAGENS.MUDOU };
  const via = (await pool.request().input("r", sql.Int, registroId).input("min", sql.Int, ck.SEGUNDA_VIA_MINUTOS)
    .query(`SELECT TOP 1 ViaId, PedidaPorMembroId FROM CheckinInfantilSegundasVias WHERE RegistroId = @r AND ConfirmadaEm IS NULL AND CanceladaEm IS NULL AND PedidaEm >= DATEADD(MINUTE, -@min, SYSUTCDATETIME()) ORDER BY ViaId DESC`)).recordset[0];
  if (!via) return { sucesso: false, mensagem: "Não há pedido de segunda via aguardando confirmação (ou passou de 10 minutos): peça de novo." };
  if (Number(via.PedidaPorMembroId) === Number(operadorId)) return { sucesso: false, proibido: true, mensagem: "Quem pediu a segunda via não a confirma: outro adulto da sala precisa conferir e confirmar." };
  const geracao = Number(reg.CodigoGeracao) + 1;
  const codigo = ck.gerarCodigo();
  const hash = ck.hashCodigo(codigo, { registroId, geracao, segredo: segredo() });
  const transaction = new sql.Transaction(pool);
  await transaction.begin();
  try {
    const u = await new sql.Request(transaction).input("v", sql.Int, via.ViaId).input("c", sql.Int, Number(operadorId))
      .query(`UPDATE CheckinInfantilSegundasVias SET ConfirmadaPorMembroId = @c, ConfirmadaEm = SYSUTCDATETIME() WHERE ViaId = @v AND ConfirmadaEm IS NULL AND CanceladaEm IS NULL; SELECT @@ROWCOUNT AS n`);
    if (Number(u.recordset[0].n) !== 1) { await fecharTransacao(transaction, false); return { sucesso: false, mudou: true, mensagem: ck.MENSAGENS.MUDOU }; }
    const r = await new sql.Request(transaction).input("r", sql.Int, registroId).input("h", sql.NVarChar(64), hash).input("g", sql.Int, geracao).input("ant", sql.Int, Number(reg.CodigoGeracao))
      .query(`UPDATE CheckinInfantilRegistros SET CodigoHash = @h, CodigoGeracao = @g, Tentativas = 0, Travado = 0 WHERE RegistroId = @r AND Situacao = 'NA_SALA' AND CodigoGeracao = @ant; SELECT @@ROWCOUNT AS n`);
    if (Number(r.recordset[0].n) !== 1) { await fecharTransacao(transaction, false); return { sucesso: false, mudou: true, mensagem: ck.MENSAGENS.MUDOU }; }
    await registrarEvento(execTx(transaction), { registroId, servicoId: sala.servicoId, equipeId: sala.equipeId, tipo: "SEGUNDA_VIA_EMITIDA", atorId: Number(operadorId), detalhe: `geracao=${geracao}` });
    await transaction.commit();
  } catch (e) { await fecharTransacao(transaction, false); throw e; }
  await registrarAuditoria({ tabela: "CheckinInfantilSegundasVias", registroId: Number(via.ViaId), acao: "CHECKIN_INFANTIL_SEGUNDA_VIA_EMITIDA", usuarioId: Number(operadorId), dadosDepois: { servicoId: sala.servicoId, equipeId: sala.equipeId, geracao } });
  const interessados = await listaDeInteressados(pool, reg, sala);
  await (deps.notificarAgora || notificarAgora)(pool, { regraChave: "CHECKIN_SEGUNDA_VIA", destinatarios: interessados.pais, mensagem: ck.textoSegundaVia({ nomeCrianca: reg.CriancaNome, salaNome: sala.equipeNome }),
    referenciaId: Number(via.ViaId), referenciaTabela: "CheckinInfantilSegundasVias", aguardarEntrega: false });
  const etiqueta = ck.montarEtiqueta({ nomeCrianca: reg.CriancaNome, idade: reg.IdadeAnos, salaNome: sala.equipeNome, congregacaoNome: sala.congregacaoNome, codigo, saudeTexto: reg.SaudeTexto, instante: new Date().toISOString() });
  return { sucesso: true, mensagem: "Segunda via emitida. O código antigo deixou de valer: entregue a etiqueta e o recibo novos a quem pediu.", registroId: Number(registroId), etiqueta };
}

// ---------------------------------------------------------------
// Lista de autorizados a retirar (criança membro) — o responsável faz; a Secretaria registra a ficha
// ---------------------------------------------------------------

async function lerCriancaMembro(pool, menorId, hoje) {
  const m = (await pool.request().input("m", sql.Int, menorId).query(`SELECT m.MembroId, m.Nome, m.DataNascimento, m.CongregacaoId, c.Nome AS CongregacaoNome FROM MembroReferencia m LEFT JOIN Congregacoes c ON c.CongregacaoId = m.CongregacaoId WHERE m.MembroId = @m`)).recordset[0];
  if (!m) return null;
  const idade = vol.idadeEmAnos(m.DataNascimento, hoje);
  return { membroId: Number(m.MembroId), nome: m.Nome, congregacaoId: m.CongregacaoId ? Number(m.CongregacaoId) : null, congregacaoNome: m.CongregacaoNome || null, idade, ehMenor: idade != null && idade < vol.MAIORIDADE };
}
async function ehResponsavelAtivo(pool, menorId, membroId) {
  return !!(await pool.request().input("m", sql.Int, menorId).input("r", sql.Int, membroId).query(`SELECT TOP 1 1 AS x FROM VoluntariadoResponsaveis WHERE MenorMembroId = @m AND ResponsavelMembroId = @r AND RevogadoEm IS NULL`)).recordset[0];
}

function mapearAutorizado(x) {
  return { autorizadoId: Number(x.AutorizadoId), nome: x.Nome, parentesco: x.Parentesco, rotuloParentesco: ck.PARENTESCOS[x.Parentesco] || null, membroId: x.AutorizadoMembroId ? Number(x.AutorizadoMembroId) : null,
    validoAte: dia(x.ValidoAte), forma: x.Forma, registradoEm: iso(x.RegistradoEm) };
}

// `ator`: { membroId, comoResponsavel: bool, gestor: { podeAlcancar(congregacaoNome) } | null }. Menor inexistente e menor que o ator não alcança recebem a mesma recusa.
async function listarAutorizados(pool, { menorId, atorId, gestorPodeVer = null, hoje = hojeBrasilia() }) {
  const m = await lerCriancaMembro(pool, menorId, hoje);
  const sonda = { sucesso: false, proibido: true, mensagem: mc.MENSAGENS.NAO_E_RESPONSAVEL };
  if (!m || !m.ehMenor) return sonda;
  const resp = await ehResponsavelAtivo(pool, menorId, atorId);
  if (!resp && !(gestorPodeVer && gestorPodeVer(m.congregacaoNome))) return sonda;
  const lista = (await pool.request().input("m", sql.Int, menorId).query(`SELECT AutorizadoId, Nome, Parentesco, AutorizadoMembroId, ValidoAte, Forma, RegistradoEm FROM CheckinInfantilAutorizados WHERE MenorMembroId = @m AND RevogadoEm IS NULL ORDER BY AutorizadoId`)).recordset;
  const responsaveis = (await pool.request().input("m", sql.Int, menorId).query(`SELECT r.Vinculo, p.Nome FROM VoluntariadoResponsaveis r JOIN MembroReferencia p ON p.MembroId = r.ResponsavelMembroId WHERE r.MenorMembroId = @m AND r.RevogadoEm IS NULL ORDER BY r.ResponsavelId`)).recordset;
  return { sucesso: true, menor: { menorId: m.membroId, nome: m.nome, idade: m.idade }, responsaveis: responsaveis.map((x) => ({ nome: x.Nome, rotuloVinculo: vol.VINCULOS_RESPONSAVEL[x.Vinculo] || null })), autorizados: lista.map(mapearAutorizado), limite: ck.MAX_AUTORIZADOS_POR_CRIANCA };
}

// `forma`: 'RESPONSAVEL' (quem faz é responsável ativo) ou 'FICHA_FISICA' (a Secretaria registra a ficha assinada; `gestorPodeVer` confere o escopo e a referência é obrigatória).
async function adicionarAutorizado(pool, { dados, atorId, forma, gestorPodeVer = null, hoje = hojeBrasilia() }) {
  const m = await lerCriancaMembro(pool, dados.menorId, hoje);
  const sonda = { sucesso: false, proibido: true, mensagem: mc.MENSAGENS.NAO_E_RESPONSAVEL };
  if (!m || !m.ehMenor) return sonda;
  if (forma === "RESPONSAVEL") { if (!(await ehResponsavelAtivo(pool, dados.menorId, atorId))) return sonda; }
  else {
    if (!gestorPodeVer || !gestorPodeVer(m.congregacaoNome)) return sonda;
    if (!dados.referencia) return { sucesso: false, mensagem: "Informe a referência da ficha assinada pelo responsável (onde ela está arquivada)." };
  }
  if (dados.membroId) {
    const a = (await pool.request().input("m", sql.Int, dados.membroId).query(`SELECT MembroId, DataNascimento FROM MembroReferencia WHERE MembroId = @m`)).recordset[0];
    if (!a) return { sucesso: false, mensagem: "A pessoa escolhida não foi encontrada no cadastro." };
    if (Number(dados.membroId) === Number(dados.menorId)) return { sucesso: false, mensagem: "A criança não pode ser autorizada a retirar a si mesma." };
    const idade = vol.idadeEmAnos(a.DataNascimento, hoje);
    if (idade == null || idade < vol.MAIORIDADE) return { sucesso: false, mensagem: "Só maiores de 18 anos (com a data de nascimento no cadastro) podem ser autorizados a retirar uma criança." };
  }
  if (dados.validoAte && dados.validoAte < hoje) return { sucesso: false, mensagem: "A validade não pode ser uma data que já passou." };
  // Contar e gravar são UM ato, sob a trava da criança: com vários pedidos ao mesmo tempo o teto de 8 nunca é furado (o e2e-21 achou 13 de 14 nomes entrando quando a contagem era
  // feita antes, fora da transação).
  const transaction = new sql.Transaction(pool);
  await transaction.begin();
  let id;
  try {
    if (!(await obterTrava(execTx(transaction), `checkin-autorizados:${dados.menorId}`))) { await fecharTransacao(transaction, false); return { sucesso: false, mensagem: "O cadastro desta criança está ocupado com outra operação. Tente de novo em instantes." }; }
    const ativos = Number((await new sql.Request(transaction).input("m", sql.Int, dados.menorId).query(`SELECT COUNT(*) AS n FROM CheckinInfantilAutorizados WHERE MenorMembroId = @m AND RevogadoEm IS NULL`)).recordset[0].n);
    if (ativos >= ck.MAX_AUTORIZADOS_POR_CRIANCA) { await fecharTransacao(transaction, false); return { sucesso: false, mensagem: `Cada criança pode ter até ${ck.MAX_AUTORIZADOS_POR_CRIANCA} pessoas autorizadas. Revogue uma para incluir outra.` }; }
    const r = await new sql.Request(transaction).input("m", sql.Int, dados.menorId).input("am", sql.Int, dados.membroId || null).input("n", sql.NVarChar(150), dados.nome).input("p", sql.NVarChar(20), dados.parentesco)
      .input("v", sql.Date, dados.validoAte || null).input("f", sql.NVarChar(12), forma).input("ref", sql.NVarChar(200), dados.referencia || null).input("por", sql.Int, Number(atorId))
      .query(`INSERT INTO CheckinInfantilAutorizados (MenorMembroId, AutorizadoMembroId, Nome, Parentesco, ValidoAte, Forma, Referencia, RegistradoPorMembroId) OUTPUT INSERTED.AutorizadoId VALUES (@m, @am, @n, @p, @v, @f, @ref, @por)`);
    id = Number(r.recordset[0].AutorizadoId);
    await transaction.commit();
  } catch (e) {
    await fecharTransacao(transaction, false);
    if (duplicado(e)) return { sucesso: false, mensagem: "Esta pessoa já está na lista de autorizados desta criança." };
    throw e;
  }
  await registrarAuditoria({ tabela: "CheckinInfantilAutorizados", registroId: id, acao: "CHECKIN_AUTORIZADO_ADICIONADO", usuarioId: Number(atorId), dadosDepois: { menorId: dados.menorId, forma } });
  return { sucesso: true, autorizadoId: id, mensagem: "Pessoa autorizada a retirar a criança." };
}

async function revogarAutorizado(pool, { autorizadoId, atorId, gestorPodeVer = null, hoje = hojeBrasilia() }) {
  const a = (await pool.request().input("a", sql.Int, autorizadoId).query(`SELECT AutorizadoId, MenorMembroId, RevogadoEm FROM CheckinInfantilAutorizados WHERE AutorizadoId = @a`)).recordset[0];
  const sonda = { sucesso: false, proibido: true, mensagem: mc.MENSAGENS.NAO_E_RESPONSAVEL };
  if (!a) return sonda;
  const m = await lerCriancaMembro(pool, a.MenorMembroId, hoje);
  if (!m) return sonda;
  const resp = await ehResponsavelAtivo(pool, a.MenorMembroId, atorId);
  if (!resp && !(gestorPodeVer && gestorPodeVer(m.congregacaoNome))) return sonda;
  if (a.RevogadoEm) return { sucesso: true, jaRevogado: true, mensagem: "Esta autorização já estava revogada." };
  const r = await pool.request().input("a", sql.Int, autorizadoId).input("por", sql.Int, Number(atorId)).query(`UPDATE CheckinInfantilAutorizados SET RevogadoEm = SYSUTCDATETIME(), RevogadoPorMembroId = @por WHERE AutorizadoId = @a AND RevogadoEm IS NULL; SELECT @@ROWCOUNT AS n`);
  if (Number(r.recordset[0].n) === 1) await registrarAuditoria({ tabela: "CheckinInfantilAutorizados", registroId: Number(autorizadoId), acao: "CHECKIN_AUTORIZADO_REVOGADO", usuarioId: Number(atorId), dadosDepois: { menorId: Number(a.MenorMembroId) } });
  return { sucesso: true, mensagem: "Autorização revogada: essa pessoa não pode mais retirar a criança (um check-in já aberto continua com a lista de quando foi feito, mas o responsável pode pedir a segunda via)." };
}

// ---------------------------------------------------------------
// Saúde da criança membro
// ---------------------------------------------------------------

async function lerSaudeDaCrianca(pool, { menorId, atorId, gestorPodeVer = null, hoje = hojeBrasilia() }) {
  const m = await lerCriancaMembro(pool, menorId, hoje);
  const sonda = { sucesso: false, proibido: true, mensagem: mc.MENSAGENS.NAO_E_RESPONSAVEL };
  if (!m || !m.ehMenor) return sonda;
  const resp = await ehResponsavelAtivo(pool, menorId, atorId);
  if (!resp && !(gestorPodeVer && gestorPodeVer(m.congregacaoNome))) return sonda;
  const vigente = await mcDb.consentimentoVigente(pool, menorId, "SAUDE_CRACHA", { hoje });
  const linha = (await pool.request().input("m", sql.Int, menorId).query(`SELECT Texto, Forma, AtualizadoEm FROM CheckinInfantilSaude WHERE MenorMembroId = @m`)).recordset[0];
  return { sucesso: true, menorId: m.membroId, consentimentoVigente: vigente, saude: vigente && linha ? { texto: linha.Texto, forma: linha.Forma, atualizadoEm: iso(linha.AtualizadoEm) } : null };
}

async function gravarSaude(pool, { dados, atorId, forma, gestorPodeVer = null, hoje = hojeBrasilia() }) {
  const m = await lerCriancaMembro(pool, dados.menorId, hoje);
  const sonda = { sucesso: false, proibido: true, mensagem: mc.MENSAGENS.NAO_E_RESPONSAVEL };
  if (!m || !m.ehMenor) return sonda;
  if (forma === "RESPONSAVEL") { if (!(await ehResponsavelAtivo(pool, dados.menorId, atorId))) return sonda; }
  else {
    if (!gestorPodeVer || !gestorPodeVer(m.congregacaoNome)) return sonda;
    if (!dados.referencia) return { sucesso: false, mensagem: "Informe a referência da ficha assinada pelo responsável (onde ela está arquivada)." };
  }
  if (!(await mcDb.consentimentoVigente(pool, dados.menorId, "SAUDE_CRACHA", { hoje }))) {
    return { sucesso: false, mensagem: "O responsável precisa autorizar primeiro o uso da informação de saúde no crachá (Meu Painel → Ministério com menores, ou ficha registrada pela Secretaria). Sem a autorização a informação não é guardada." };
  }
  await pool.request().input("m", sql.Int, dados.menorId).input("t", sql.NVarChar(400), dados.texto).input("f", sql.NVarChar(12), forma).input("ref", sql.NVarChar(200), dados.referencia || null).input("por", sql.Int, Number(atorId))
    .query(`MERGE CheckinInfantilSaude WITH (HOLDLOCK) AS d USING (SELECT @m AS MenorMembroId) AS o ON d.MenorMembroId = o.MenorMembroId
            WHEN MATCHED THEN UPDATE SET Texto = @t, Forma = @f, Referencia = @ref, RegistradoPorMembroId = @por, AtualizadoEm = SYSUTCDATETIME()
            WHEN NOT MATCHED THEN INSERT (MenorMembroId, Texto, Forma, Referencia, RegistradoPorMembroId) VALUES (@m, @t, @f, @ref, @por);`);
  // nunca o texto da saúde na auditoria
  await registrarAuditoria({ tabela: "CheckinInfantilSaude", registroId: Number(dados.menorId), acao: "CHECKIN_SAUDE_GRAVADA", usuarioId: Number(atorId), dadosDepois: { forma } });
  return { sucesso: true, mensagem: "Informação de saúde guardada: aparece na etiqueta do check-in." };
}

// Apaga o dado de saúde da criança e as cópias nos registros de check-in. Chamado ao revogar o consentimento (na mesma operação) e pelo responsável quando quiser.
async function apagarSaudeDoMenor(pool, { menorId, por = null }) {
  const a = await pool.request().input("m", sql.Int, menorId).query(`DELETE FROM CheckinInfantilSaude WHERE MenorMembroId = @m; SELECT @@ROWCOUNT AS n`);
  const b = await pool.request().input("m", sql.Int, menorId).query(`UPDATE CheckinInfantilRegistros SET SaudeTexto = NULL, SaudeOrigem = NULL, SaudeTextoVersao = NULL, SaudeTextoHash = NULL WHERE MenorMembroId = @m AND SaudeTexto IS NOT NULL; SELECT @@ROWCOUNT AS n`);
  const apagou = Number((a.recordset[0] || {}).n || 0) + Number((b.recordset[0] || {}).n || 0) > 0;
  if (apagou && por != null) await registrarAuditoria({ tabela: "CheckinInfantilSaude", registroId: Number(menorId), acao: "CHECKIN_SAUDE_APAGADA", usuarioId: Number(por), dadosDepois: { motivo: "REVOGACAO_OU_PEDIDO" } });
  return { apagou };
}

// A rotina diária (e o ato que tira um responsável): quem perdeu o consentimento de saúde por outro caminho (responsável desativado, 18 anos) também tem o dado apagado.
// `menorId` limita a uma criança.
async function apagarSaudeSemConsentimento(pool, { hoje = hojeBrasilia(), menorId = null } = {}) {
  const filtro = (alias) => (menorId ? ` AND ${alias}MenorMembroId = @m` : "");
  const req = () => { const r = pool.request(); if (menorId) r.input("m", sql.Int, Number(menorId)); return r; };
  const alvos = (await req().query(`SELECT MenorMembroId FROM CheckinInfantilSaude WHERE 1 = 1${filtro("")}`)).recordset;
  let apagadas = 0;
  for (const a of alvos) {
    if (await mcDb.consentimentoVigente(pool, Number(a.MenorMembroId), "SAUDE_CRACHA", { hoje })) continue;
    const r = await apagarSaudeDoMenor(pool, { menorId: Number(a.MenorMembroId) });
    if (r.apagou) apagadas++;
  }
  // as cópias nos registros de uma criança que já nem tem a linha de saúde (ficaram de antes): sem consentimento vigente, também saem
  const copias = (await req().query(`SELECT DISTINCT MenorMembroId FROM CheckinInfantilRegistros WHERE MenorMembroId IS NOT NULL AND SaudeTexto IS NOT NULL AND SaudeOrigem = 'CADASTRO'${filtro("")}`)).recordset;
  for (const c of copias) {
    if (await mcDb.consentimentoVigente(pool, Number(c.MenorMembroId), "SAUDE_CRACHA", { hoje })) continue;
    await apagarSaudeDoMenor(pool, { menorId: Number(c.MenorMembroId) });
    apagadas++;
  }
  return { apagadas };
}

// ---------------------------------------------------------------
// Histórico
// ---------------------------------------------------------------

// O responsável vê só o histórico das crianças de que ele é responsável ATIVO: data, sala, quem trouxe, quem retirou e os horários. Nunca o código, o voluntário, a saúde ou o motivo da liderança.
async function historicoDoResponsavel(pool, { responsavelId, menorId = null, limite = 100 }) {
  const rq = pool.request().input("r", sql.Int, Number(responsavelId)).input("lim", sql.Int, Math.min(Math.max(Number(limite) || 100, 1), ck.LIMITE_LISTA));
  let filtro = "";
  if (menorId) { rq.input("m", sql.Int, Number(menorId)); filtro = " AND r.MenorMembroId = @m"; }
  const linhas = (await rq.query(`
    SELECT TOP (@lim) ${COLUNAS_REGISTRO}, e.Nome AS EquipeNome, c.Nome AS CongregacaoNome, s.DataHora AS ServicoDataHora
    ${JUNCOES_REGISTRO}
    JOIN EscalasEquipes e ON e.EquipeId = r.EquipeId JOIN Congregacoes c ON c.CongregacaoId = r.CongregacaoId JOIN EscalasServicos s ON s.ServicoId = r.ServicoId
    WHERE r.MenorMembroId IS NOT NULL AND EXISTS (SELECT 1 FROM VoluntariadoResponsaveis v WHERE v.MenorMembroId = r.MenorMembroId AND v.ResponsavelMembroId = @r AND v.RevogadoEm IS NULL)${filtro}
    ORDER BY r.RegistroId DESC`)).recordset;
  return linhas.map((r) => ({
    ...ck.linhaDoHistoricoParaResponsavel({ registroId: Number(r.RegistroId), data: dia(r.ServicoDataHora), salaNome: r.EquipeNome, congregacaoNome: r.CongregacaoNome, entregueEm: iso(r.EntregueEm), retiradoEm: iso(r.RetiradoEm),
      situacao: r.Situacao, quemTrouxe: r.TrouxeNomeResolvido, quemRetirou: r.Situacao === "RETIRADA" ? r.RetiradoNomeResolvido : null, divergente: !!r.Divergente }),
    menorId: Number(r.MenorMembroId), crianca: r.CriancaNome
  }));
}

// Os filhos (menores com responsável ativo) de quem consulta, para a tela "Meus filhos".
async function meusFilhos(pool, { responsavelId, hoje = hojeBrasilia() }) {
  const lista = (await require("./voluntariadoDb").menoresDoResponsavel(pool, Number(responsavelId), { hoje })).filter((x) => x.aindaMenor);
  return lista.map((x) => ({ menorId: x.menorId, nome: x.nome, idade: x.idade, vinculo: x.vinculo, rotuloVinculo: x.rotuloVinculo }));
}

// O relatório do dia da sala (liderança e equipe da sala): todas as crianças do serviço, com os horários e os atos.
async function relatorioDaSala(pool, sala) {
  const regs = (await pool.request().input("s", sql.Int, sala.servicoId).input("e", sql.Int, sala.equipeId).query(`
    SELECT ${COLUNAS_REGISTRO} ${JUNCOES_REGISTRO} WHERE r.ServicoId = @s AND r.EquipeId = @e ORDER BY r.RegistroId`)).recordset;
  const rq = pool.request().input("s", sql.Int, sala.servicoId).input("e", sql.Int, sala.equipeId);
  const eventos = (await rq.query(`SELECT ev.EventoId, ev.RegistroId, ev.Tipo, ev.AtorMembroId, ev.Em, ev.Detalhe, m.Nome AS AtorNome FROM CheckinInfantilEventos ev JOIN MembroReferencia m ON m.MembroId = ev.AtorMembroId
    WHERE ev.ServicoId = @s AND ev.EquipeId = @e ORDER BY ev.EventoId`)).recordset;
  const voluntarios = (await pool.request().input("s", sql.Int, sala.servicoId).input("e", sql.Int, sala.equipeId).query(`SELECT v.MembroId, m.Nome, v.EntrouEm, v.SaiuEm FROM CheckinInfantilVoluntarios v JOIN MembroReferencia m ON m.MembroId = v.MembroId WHERE v.ServicoId = @s AND v.EquipeId = @e ORDER BY v.PresencaId`)).recordset;
  return {
    sala,
    voluntarios: voluntarios.map((v) => ({ membroId: Number(v.MembroId), nome: v.Nome, entrouEm: iso(v.EntrouEm), saiuEm: iso(v.SaiuEm) })),
    criancas: regs.map((r) => ({
      registroId: Number(r.RegistroId), nome: r.CriancaNome, tipo: r.MenorMembroId ? "MEMBRO" : "VISITANTE", idade: r.IdadeAnos, entregueEm: iso(r.EntregueEm), quemTrouxe: r.TrouxeNomeResolvido || null,
      situacao: r.Situacao, retiradoEm: iso(r.RetiradoEm), quemRetirou: r.RetiradoNomeResolvido || null, retiradaDivergente: !!r.Divergente, tipoRetirante: r.RetiradoTipo || null
    })),
    eventos: eventos.map((e) => ({ eventoId: Number(e.EventoId), registroId: e.RegistroId ? Number(e.RegistroId) : null, tipo: e.Tipo, rotulo: ck.TIPOS_EVENTO[e.Tipo] || e.Tipo, ator: e.AtorNome, em: iso(e.Em), detalhe: e.Detalhe || null }))
  };
}

// ---------------------------------------------------------------
// Rotinas diárias
// ---------------------------------------------------------------

// Criança que ficou "na sala" depois do fim do serviço: o registro de retirada está faltando. A gestão da congregação e o líder da sala são avisados na manhã seguinte.
async function detectarCriancasSemRetirada(pool, { hoje = hojeBrasilia() } = {}) {
  const linhas = (await pool.request().input("hoje", sql.Date, hoje).query(`
    SELECT r.ServicoId, r.EquipeId, COUNT(*) AS n, MIN(s.DataHora) AS DataHora, MAX(e.Nome) AS EquipeNome, MAX(r.CongregacaoId) AS CongregacaoId, MAX(e.LiderMembroId) AS LiderMembroId
    FROM CheckinInfantilRegistros r JOIN EscalasServicos s ON s.ServicoId = r.ServicoId JOIN EscalasEquipes e ON e.EquipeId = r.EquipeId
    WHERE r.Situacao <> 'RETIRADA' AND CAST(s.DataHora AS DATE) < @hoje AND CAST(s.DataHora AS DATE) >= DATEADD(DAY, -7, @hoje)
    GROUP BY r.ServicoId, r.EquipeId`)).recordset;
  const fatos = [];
  for (const x of linhas) {
    const interessados = await listaDeInteressados(pool, { MenorMembroId: null }, { liderMembroId: x.LiderMembroId ? Number(x.LiderMembroId) : null, congregacaoId: Number(x.CongregacaoId) });
    if (!interessados.gestao.length) continue;
    fatos.push({
      referenciaId: ck.referenciaDeSemRetirada(x.ServicoId, x.EquipeId), destinatarios: interessados.gestao,
      fatoGerador: ck.textoSemRetirada({ quantidade: Number(x.n), salaNome: x.EquipeNome, data: new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC", dateStyle: "short" }).format(x.DataHora instanceof Date ? x.DataHora : new Date(x.DataHora)) })
    });
  }
  return fatos;
}

// O telefone de quem trouxe um visitante e o dado de saúde informado no balcão saem depois de N dias; passado o prazo de retenção (5 anos), o registro é anonimizado.
async function aplicarRetencao(pool, { hoje = hojeBrasilia() } = {}) {
  const prazos = await lerPrazos(pool);
  const retencaoDias = Number((await pool.request().query(`SELECT TOP 1 DiasRetencao FROM PoliticasRetencao WHERE Categoria = N'Check-in infantil (entrega e retirada de crianças)'`)).recordset[0]?.DiasRetencao) || 1825;
  const curto = await pool.request().input("hoje", sql.Date, hoje).input("d", sql.Int, prazos.visitanteContatoDias).query(`
    UPDATE CheckinInfantilRegistros SET TrouxeContato = NULL, SaudeTexto = CASE WHEN SaudeOrigem = 'BALCAO' THEN NULL ELSE SaudeTexto END,
           SaudeOrigem = CASE WHEN SaudeOrigem = 'BALCAO' THEN NULL ELSE SaudeOrigem END, SaudeTextoVersao = CASE WHEN SaudeOrigem = 'BALCAO' THEN NULL ELSE SaudeTextoVersao END,
           SaudeTextoHash = CASE WHEN SaudeOrigem = 'BALCAO' THEN NULL ELSE SaudeTextoHash END
    WHERE EntregueEm < DATEADD(DAY, -@d, CAST(@hoje AS DATETIME2)) AND (TrouxeContato IS NOT NULL OR SaudeOrigem = 'BALCAO'); SELECT @@ROWCOUNT AS n`);
  const longo = await pool.request().input("hoje", sql.Date, hoje).input("d", sql.Int, retencaoDias).query(`
    UPDATE CheckinInfantilRegistros SET VisitanteNome = CASE WHEN MenorMembroId IS NULL THEN N'(anonimizado)' ELSE VisitanteNome END, VisitanteNascimento = NULL, TrouxeNome = NULL, TrouxeContato = NULL,
           MenorMembroId = NULL, TrouxeMembroId = NULL, RetiradoMembroId = NULL,
           RetiradoNome = NULL, SaudeTexto = NULL, SaudeOrigem = NULL, SaudeTextoVersao = NULL, SaudeTextoHash = NULL, AnonimizadoEm = SYSUTCDATETIME()
    WHERE AnonimizadoEm IS NULL AND Situacao = 'RETIRADA' AND EntregueEm < DATEADD(DAY, -@d, CAST(@hoje AS DATETIME2)); SELECT @@ROWCOUNT AS n`);
  const visitas = await pool.request().input("hoje", sql.Date, hoje).input("d", sql.Int, retencaoDias).query(`
    UPDATE v SET Nome = NULL FROM CheckinInfantilAutorizadosVisita v JOIN CheckinInfantilRegistros r ON r.RegistroId = v.RegistroId WHERE r.AnonimizadoEm IS NOT NULL AND v.Nome IS NOT NULL; SELECT @@ROWCOUNT AS n`);
  return { contatosApagados: Number(curto.recordset[0].n), anonimizados: Number(longo.recordset[0].n), autorizadosDeVisitaAnonimizados: Number(visitas.recordset[0].n) };
}

// ---------------------------------------------------------------
// Meus Dados (o titular vê o que há dele: como criança, como quem trouxe ou retirou, como autorizado)
// ---------------------------------------------------------------

async function dadosDoTitular(pool, membroId) {
  const id = Number(membroId);
  const linha = async (consulta) => (await pool.request().input("m", sql.Int, id).query(consulta)).recordset[0] || {};
  const comoCrianca = await linha(`SELECT COUNT(*) AS n, MAX(EntregueEm) AS ultimo FROM CheckinInfantilRegistros WHERE MenorMembroId = @m`);
  const comoPessoa = await linha(`SELECT COUNT(*) AS n, MAX(EntregueEm) AS ultimo FROM CheckinInfantilRegistros WHERE TrouxeMembroId = @m OR RetiradoMembroId = @m`);
  const autorizado = await linha(`SELECT COUNT(*) AS n FROM CheckinInfantilAutorizados WHERE AutorizadoMembroId = @m AND RevogadoEm IS NULL`);
  const saude = await linha(`SELECT COUNT(*) AS n FROM CheckinInfantilSaude WHERE MenorMembroId = @m`);
  return {
    comoCrianca: { registros: Number(comoCrianca.n), ultimo: iso(comoCrianca.ultimo), saudeGuardada: Number(saude.n) > 0 },
    comoQuemTrouxeOuRetirou: { registros: Number(comoPessoa.n), ultimo: iso(comoPessoa.ultimo) },
    comoAutorizado: { criancas: Number(autorizado.n) }
  };
}

module.exports = {
  lerPrazos, contextoDaSala, papelDoOperador, estaPresente, conferirOperador, presentes, entrarNaSala, sairDaSala,
  carregarAutorizados, snapshotDaSala, minhasSalas, buscarCriancas, responsaveisDaCrianca, fazerCheckin,
  relacionadoComASala, lerRegistro, registroComSala, retirar, decidirDivergencia, destravar, pedirSegundaVia, confirmarSegundaVia,
  listarAutorizados, adicionarAutorizado, revogarAutorizado, lerSaudeDaCrianca, gravarSaude, apagarSaudeDoMenor, apagarSaudeSemConsentimento,
  historicoDoResponsavel, meusFilhos, relatorioDaSala, detectarCriancasSemRetirada, aplicarRetencao, dadosDoTitular
};
