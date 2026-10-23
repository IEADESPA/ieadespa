// shared/criseSegurancaDb.js (v7.15 — Gestão de crise e porta-voz único; segurança da congregação) — o banco. A regra está em shared/criseSeguranca.js (pura, testada).
//
// Quem pode o quê (decidido aqui e conferido pelos roteiros ponta a ponta tools/e2e-localdb/e2e-33 e e2e-34):
//   - qualquer sessão de LIDERANÇA vê a faixa "Crise ativa — porta-voz único: fulano" e registra o pedido da imprensa que chegou a ela (é assim que encaminha); vê só os
//     pedidos que ela mesma registrou, com a situação;
//   - o nível geral com a permissão crise_gestao (Presidente e Secretário Geral) abre e encerra o regime e designa o porta-voz (com a confirmação reforçada, na rota), registra
//     manifestação, vê e responde todos os pedidos; o PORTA-VOZ da crise ativa (se for membro com sessão de liderança) registra manifestação e responde os pedidos;
//   - a permissão seguranca_congregacao (Dirigente, Pastor de Área e o nível geral) cuida do plano de emergência, dos simulados, da vistoria e da equipe de segurança, cada um
//     só nas congregações do seu território (a Extensão e o Departamento não entram).
// O aviso da crise vai a toda a liderança ativa pela comunicação da v7.12 (categoria CRISE): o sininho nasce na mesma transação do ato; o celular sai na primeira rodada, junto
// com a resposta; o e-mail vai pela fila (100 por hora no Azure). Nada aqui se edita depois de registrado: correção é linha nova (gatilhos no banco).
// Respostas de escrita: { sucesso, mensagem, ... }; `naoExiste` = 404 (o mesmo para o que não existe e para o que a pessoa não alcança), `proibido` = 403, `mudou` = 409,
// `limite` = 429.
const crypto = require("crypto");
const { sql } = require("./db");
const { registrarAuditoria } = require("./auditoria");
const cs = require("./criseSeguranca");
const com = require("./comunicacaoDb");
const { hojeBrasilia } = require("./dataBrasilia");
const { lerPrazoDias, notificarAgora } = require("./canaisDb");
const { obterTrava } = require("./financeiroSeguro");
const { resolverDestinatariosPorPermissao } = require("./notificacoes");

const RETENCAO = {
  contatoImprensa: { categoria: "Crise — contato do jornalista na demanda de imprensa", padrao: 1825 },
  equipe: { categoria: "Segurança — equipe de segurança após a saída", padrao: 1825 }
};
const MAX_DEMANDAS_DIA = 30;                 // por pessoa: o pedido da imprensa é coisa rara; mais que isso é engano ou abuso
const AVISOS_IMPRENSA_DIA = 10;              // avisos de pedido da imprensa por destinatário em 24 horas (o pedido continua registrado e na lista)
const CACHE_FAIXA_MS = 20000;               // a faixa é lida por toda tela da liderança: 20 segundos em memória (zerado a cada ato da crise nesta instância)
const GRUPO_AVISO = "Toda a liderança ativa (aviso do regime de crise, Regimento Art. 161-B)";

const NAO_EXISTE = { sucesso: false, naoExiste: true };
const PROIBIDO = (mensagem) => ({ sucesso: false, proibido: true, mensagem });
const MUDOU = (mensagem, extra = {}) => ({ sucesso: false, mudou: true, mensagem, ...extra });
const RECUSA = (mensagem) => ({ sucesso: false, mensagem });
const OCUPADO = (mensagem) => ({ sucesso: false, limite: true, mensagem });
const iso = (v) => (v instanceof Date ? v.toISOString() : v ? String(v) : null);
const dia = (v) => (v == null ? null : v instanceof Date ? v.toISOString().slice(0, 10) : String(v).slice(0, 10));
const contagem = (x) => Number((((x && x.recordset) || [])[0] || {}).n) || 0;
const mesmo = (a, b) => a != null && b != null && Number(a) === Number(b);
// "23/10/2026 às 14:30" no horário de Brasília (UTC-3, sem horário de verão desde 2019)
function dataHoraBr(d) { const s = new Date(d.getTime() - 3 * 3600000).toISOString(); return `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)} às ${s.slice(11, 16)}`; }
async function fecharTransacao(t, ok) { try { if (ok) await t.commit(); else await t.rollback(); } catch (e) { /* já encerrada */ } }
// A auditoria guarda só o id e o código do ato (nunca o texto do motivo, da manifestação, do pedido da imprensa nem nomes).
async function auditar(tabela, registroId, acao, usuarioId) {
  await registrarAuditoria({ tabela, registroId: registroId || 0, acao, usuarioId: usuarioId || null, dadosDepois: {} });
}
// A marca de sessão que os gatilhos aceitam para a retenção e a exclusão LGPD: ligada, usada e DESLIGADA no MESMO lote, também no erro (o molde da 148 e da 150).
function comMarca(chave, corpo) {
  return `DECLARE @apagadas INT = 0;
BEGIN TRY
  EXEC sp_set_session_context @key = N'${chave}', @value = 1;
  ${corpo}
  EXEC sp_set_session_context @key = N'${chave}', @value = NULL;
END TRY
BEGIN CATCH
  EXEC sp_set_session_context @key = N'${chave}', @value = NULL;
  THROW;
END CATCH;
SELECT @apagadas AS n`;
}
const EXCLUIDO_SQL = "EXISTS (SELECT 1 FROM SolicitacoesTitularLGPD s WHERE s.MembroId = m.MembroId AND s.Tipo = 'EXCLUSAO' AND s.Status = 'ATENDIDA')";
const LIDERANCA_ATIVA_SQL = "(l.AtivoAte IS NULL OR l.AtivoAte >= CAST(SYSUTCDATETIME() AS DATE))";
async function diasDeRetencao(pool, chave) {
  const r = RETENCAO[chave];
  const linha = (await pool.request().input("c", sql.NVarChar(60), r.categoria).query(`SELECT TOP 1 DiasRetencao FROM PoliticasRetencao WHERE Categoria = @c AND Ativo = 1`)).recordset[0];
  const n = linha ? Number(linha.DiasRetencao) : NaN;
  return Number.isInteger(n) && n >= 1 ? n : r.padrao;
}

// ---------------------------------------------------------------
// A crise: leitura
// ---------------------------------------------------------------

const SELECT_CRISE = `SELECT c.*, o.Nome AS OrdenadoPorNome, r.Nome AS RegistradoPorNome, e.Nome AS EncerradaPorNome FROM CriseRegimes c
  LEFT JOIN MembroReferencia o ON o.MembroId = c.OrdenadoPorMembroId LEFT JOIN MembroReferencia r ON r.MembroId = c.RegistradoPorMembroId
  LEFT JOIN MembroReferencia e ON e.MembroId = c.EncerradaPorMembroId`;
async function carregarCrise(pool, criseId) {
  return (await pool.request().input("id", sql.Int, criseId).query(`${SELECT_CRISE} WHERE c.CriseId = @id`)).recordset[0] || null;
}
async function criseAtiva(pool) {
  return (await pool.request().query(`${SELECT_CRISE} WHERE c.Status = 'ATIVA'`)).recordset[0] || null;
}
const portaVozDe = (c) => ({ tipo: c.PortaVozTipo, membroId: c.PortaVozMembroId || null, nome: c.PortaVozNome, contato: c.PortaVozContato, ato: c.DesignacaoAto || null });
function formatarCrise(c) {
  return {
    criseId: c.CriseId, status: c.Status, motivo: c.Motivo, alcance: c.Alcance, abertaEm: iso(c.AbertaEm), encerradaEm: iso(c.EncerradaEm), resumoEncerramento: c.ResumoEncerramento || null,
    ordenadoPor: c.OrdenadoPorNome || null, registradoPor: c.RegistradoPorNome || null, encerradaPor: c.EncerradaPorNome || null, portaVoz: portaVozDe(c)
  };
}
// É o porta-voz da crise ATIVA (pela matrícula)?
const ehPortaVozDa = (crise, ver) => !!(crise && crise.Status === "ATIVA" && ver && mesmo(crise.PortaVozMembroId, ver.membroId));

// A faixa de toda tela da liderança: leve (uma consulta, 20 s em memória). Nunca o motivo: só que há crise, desde quando e quem fala.
let cacheFaixa = null;
function limparCacheFaixa() { cacheFaixa = null; }
async function faixa(pool, { ver }) {
  const agora = Date.now();
  if (!cacheFaixa || cacheFaixa.ate <= agora) {
    const c = (await pool.request().query(`SELECT TOP 1 CriseId, AbertaEm, PortaVozTipo, PortaVozMembroId, PortaVozNome, PortaVozContato FROM CriseRegimes WHERE Status = 'ATIVA'`)).recordset[0] || null;
    cacheFaixa = { ate: agora + CACHE_FAIXA_MS, c };
  }
  const c = cacheFaixa.c;
  if (!c) return { ativa: false };
  return { ativa: true, criseId: c.CriseId, desde: iso(c.AbertaEm), portaVoz: { tipo: c.PortaVozTipo, nome: c.PortaVozNome, contato: c.PortaVozContato },
    souPortaVoz: mesmo(c.PortaVozMembroId, ver && ver.membroId) };
}

// O Presidente de hoje (o que ordena o regime e pode ser o porta-voz): Liderança com o papel "Presidente", vigente, membro ativo; o cadastro mais recente.
async function presidenteAtual(pool) {
  const r = await pool.request().query(`
    SELECT TOP 1 m.MembroId, m.Nome FROM Lideranca l JOIN Papeis p ON p.PapelId = l.PapelId AND p.Nome = N'Presidente' JOIN MembroReferencia m ON m.MembroId = l.MembroId
    WHERE m.Status = 'ATIVO' AND ${LIDERANCA_ATIVA_SQL} ORDER BY l.LiderancaId DESC`);
  const p = r.recordset[0];
  return p ? { membroId: p.MembroId, nome: p.Nome } : null;
}
// Quem recebe o aviso: toda pessoa com Liderança vigente, ativa no cadastro e sem exclusão LGPD atendida.
async function liderancaAtiva(pool) {
  return (await pool.request().query(`
    SELECT DISTINCT m.MembroId, m.Nome, c.Nome AS Congregacao FROM Lideranca l JOIN MembroReferencia m ON m.MembroId = l.MembroId
    LEFT JOIN Congregacoes c ON c.CongregacaoId = m.CongregacaoId
    WHERE m.Status = 'ATIVO' AND ${LIDERANCA_ATIVA_SQL} AND NOT ${EXCLUIDO_SQL}`)).recordset;
}
// No encerramento, também quem recebeu algum aviso desta crise e deixou a liderança no meio (o fim da vedação vale para essa pessoa também).
async function destinatariosDoFim(pool, criseId) {
  const lideres = await liderancaAtiva(pool);
  const extra = (await pool.request().input("c", sql.Int, criseId).query(`
    SELECT DISTINCT m.MembroId, m.Nome, cg.Nome AS Congregacao FROM CriseHistorico h JOIN ComunicacaoEntregas s ON s.EnvioId = h.EnvioId AND s.Canal = 'SININHO'
    JOIN MembroReferencia m ON m.MembroId = s.MembroId LEFT JOIN Congregacoes cg ON cg.CongregacaoId = m.CongregacaoId
    WHERE h.CriseId = @c AND m.Status = 'ATIVO' AND NOT ${EXCLUIDO_SQL}`)).recordset;
  const vistos = new Set(lideres.map((p) => p.MembroId));
  return [...lideres, ...extra.filter((p) => !vistos.has(p.MembroId))];
}
async function enviosDaCrise(rq, criseId) {
  return (await rq.input("c", sql.Int, criseId).query(`SELECT EnvioId FROM CriseHistorico WHERE CriseId = @c AND EnvioId IS NOT NULL`)).recordset.map((x) => x.EnvioId);
}
// Matrícula do profissional designado (opcional): tem de existir e estar ativa; o nome passa a ser o do cadastro.
async function conferirPortaVoz(pool, portaVoz) {
  if (portaVoz.tipo !== "DESIGNADO" || !portaVoz.membroId) return { portaVoz };
  const m = (await pool.request().input("m", sql.Int, portaVoz.membroId).query(`SELECT m.MembroId, m.Nome, m.Status, CASE WHEN ${EXCLUIDO_SQL} THEN 1 ELSE 0 END AS Excluido FROM MembroReferencia m WHERE m.MembroId = @m`)).recordset[0];
  if (!m || m.Status !== "ATIVO" || m.Excluido) return { problema: "A matrícula do porta-voz não existe ou não está ativa (deixe em branco se o profissional não é membro)." };
  return { portaVoz: { ...portaVoz, nome: String(m.Nome).slice(0, cs.MAX.nome) } };
}
const insereHistorico = async (rq, { criseId, evento, portaVoz, textoLivre, membroId, envioId }) => (await rq.input("c", sql.Int, criseId).input("ev", sql.NVarChar(12), evento)
  .input("pt", sql.NVarChar(12), portaVoz.tipo).input("pm", sql.Int, portaVoz.membroId || null).input("pn", sql.NVarChar(150), portaVoz.nome).input("pc", sql.NVarChar(150), portaVoz.contato)
  .input("pa", sql.NVarChar(300), portaVoz.ato || null).input("tx", sql.NVarChar(500), textoLivre || null).input("m", sql.Int, membroId).input("e", sql.Int, envioId || null)
  .query(`INSERT INTO CriseHistorico (CriseId, Evento, PortaVozTipo, PortaVozMembroId, PortaVozNome, PortaVozContato, DesignacaoAto, Texto, MembroId, EnvioId)
          VALUES (@c, @ev, @pt, @pm, @pn, @pc, @pa, @tx, @m, @e); SELECT CAST(SCOPE_IDENTITY() AS INT) AS id`)).recordset[0].id;
const chaveDoAviso = (criseId, evento) => `crise-${criseId}-${evento === "ABERTA" ? "abertura" : evento === "ENCERRADA" ? "fim" : "pv"}-${crypto.randomBytes(3).toString("hex")}`;
const dataBr = (iso10) => String(iso10).split("-").reverse().join("/");

// O tempo da requisição (o Static Web Apps corta em ~45 s; a tela espera 40 s): o celular do aviso sai em paralelo até ~30 s depois do início do ato, e a fila roda curta.
const PRAZO_DO_ATO_MS = 30000;
// Depois do commit de abrir, trocar o porta-voz ou encerrar: o celular do aviso em paralelo, a rodada curta da fila, o aviso ao Presidente quando o ato foi de outra pessoa
// em nome dele, e a mensagem que diz a VERDADE sobre o que já saiu (revisão independente, v7.15).
async function depoisDoAto(pool, { ver, acao, envioId, historicoId, inicio, deps, presidente, rotuloAto }) {
  const decorrido = Date.now() - inicio;
  const orcamentoCelularMs = Math.max(4000, Math.min(15000, PRAZO_DO_ATO_MS - decorrido - 6000));
  await com.depoisDoAvisoDoSistema(pool, { deps, orcamentoCelularMs, orcamentoFilaMs: 5000 });
  if (presidente && !mesmo(presidente.membroId, ver.membroId)) {
    const quem = (await pool.request().input("m", sql.Int, ver.membroId).query(`SELECT Nome FROM MembroReferencia WHERE MembroId = @m`)).recordset[0];
    await notificarAgora(pool, { regraChave: "CRISE_EM_SEU_NOME", destinatarios: [{ membroId: presidente.membroId, nome: presidente.nome, email: null }], referenciaTabela: "CriseHistorico",
      referenciaId: historicoId, mensagem: `${rotuloAto} em seu nome por ${quem ? quem.Nome : "outra pessoa do nível geral"}. Confira em Crise e segurança → Crise.`, deps });
  }
  return mensagemDoAviso(acao, await com.situacaoDoAvisoDoSistema(pool, envioId));
}
function mensagemDoAviso(acao, a) {
  const push = (a && a.canais && a.canais.PUSH) || {};
  const n = (s) => Number(push[s]) || 0;
  const comAparelho = n("ACEITO") + n("FALHOU") + n("PENDENTE") + n("ENVIANDO");
  const faltam = n("PENDENTE") + n("ENVIANDO");
  return `${acao} Sininho: ${Number(a && a.total) || 0} líder(es) já avisados. Celular: ${n("ACEITO")} de ${comAparelho} aparelho(s) avisados agora`
    + (faltam ? `; os outros ${faltam} saem pela fila em minutos (de 15 em 15 minutos, das 6h às 23h) ou no botão "Continuar o aviso agora"` : "")
    + `. E-mail: sai aos poucos (o serviço aceita 100 por hora) e só para quem ainda não foi alcançado pelo sininho ou pelo celular.`;
}

// ---------------------------------------------------------------
// A crise: abrir, designar o porta-voz, encerrar
// ---------------------------------------------------------------

async function abrir(pool, { ver, dados, deps = {}, hoje = hojeBrasilia() }) {
  const inicio = Date.now();
  if (!ver.crise) return PROIBIDO("Abrir o regime de crise é do nível geral (Presidente e Secretário Geral).");
  const presidente = await presidenteAtual(pool);
  if (!presidente) return RECUSA("Não há Presidente ativo na Liderança: quem ordena o regime é o Presidente. Cadastre-o em Permissões.");
  const v = cs.validarAbertura(dados, { presidente });
  if (v.problema) return RECUSA(v.problema);
  const pv = await conferirPortaVoz(pool, v.dados.portaVoz);
  if (pv.problema) return RECUSA(pv.problema);
  const antes = await criseAtiva(pool);
  if (antes) return MUDOU(`Já há um regime de crise ativo desde ${dataBr(cs.diaBrasilia(antes.AbertaEm))}: encerre-o antes de abrir outro.`, { jaAtiva: true });
  const texto = cs.textoAviso({ evento: "ABERTA", portaVoz: pv.portaVoz, desde: hoje });
  const preparo = await com.prepararAvisoDoSistema(pool, { categoria: "CRISE", titulo: texto.titulo, corpo: texto.corpo, pessoas: await liderancaAtiva(pool),
    celular: cs.textoCelular({ evento: "ABERTA", portaVoz: pv.portaVoz }) });
  const t = new sql.Transaction(pool);
  let criseId, envioId, historicoId;
  try {
    await t.begin();
    if (!(await obterTrava(() => new sql.Request(t), "crise-regime", 10000))) { await fecharTransacao(t, false); return OCUPADO("Outro ato da crise está sendo gravado. Tente de novo."); }
    // a garantia: dentro da trava, ninguém abriu enquanto isso (o índice único UX_CriseRegimes_UmaAtiva é a última barreira)
    const outra = (await new sql.Request(t).query(`SELECT TOP 1 CriseId FROM CriseRegimes WITH (UPDLOCK, HOLDLOCK) WHERE Status = 'ATIVA'`)).recordset[0];
    if (outra) { await fecharTransacao(t, false); return MUDOU("Outra pessoa abriu o regime de crise agora mesmo: veja o painel.", { jaAtiva: true }); }
    const p = pv.portaVoz;
    criseId = (await new sql.Request(t).input("mo", sql.NVarChar(300), v.dados.motivo).input("or", sql.Int, presidente.membroId).input("re", sql.Int, ver.membroId)
      .input("pt", sql.NVarChar(12), p.tipo).input("pm", sql.Int, p.membroId || null).input("pn", sql.NVarChar(150), p.nome).input("pc", sql.NVarChar(150), p.contato)
      .input("pa", sql.NVarChar(300), p.ato || null)
      .query(`INSERT INTO CriseRegimes (Motivo, OrdenadoPorMembroId, RegistradoPorMembroId, PortaVozTipo, PortaVozMembroId, PortaVozNome, PortaVozContato, DesignacaoAto)
              VALUES (@mo, @or, @re, @pt, @pm, @pn, @pc, @pa); SELECT CAST(SCOPE_IDENTITY() AS INT) AS id`)).recordset[0].id;
    envioId = await com.gravarAvisoDoSistema(() => new sql.Request(t), preparo, { chave: chaveDoAviso(criseId, "ABERTA"), enviadoPor: ver.membroId, grupo: GRUPO_AVISO });
    historicoId = await insereHistorico(new sql.Request(t), { criseId, evento: "ABERTA", portaVoz: p, textoLivre: v.dados.motivo, membroId: ver.membroId, envioId });
    await t.commit();
  } catch (e) { await fecharTransacao(t, false); throw e; }
  limparCacheFaixa();
  await auditar("CriseRegimes", criseId, "CRISE_ABERTA", ver.membroId);
  const mensagem = await depoisDoAto(pool, { ver, acao: "Regime de crise aberto.", envioId, historicoId, inicio, deps, presidente, rotuloAto: "O regime de crise foi aberto" });
  return { sucesso: true, criseId, mensagem, ...(await detalheCrise(pool, { ver, criseId })) };
}

async function designarPortaVoz(pool, { ver, criseId, dados, deps = {} }) {
  const inicio = Date.now();
  if (!ver.crise) return PROIBIDO("Designar o porta-voz é do nível geral (Presidente e Secretário Geral).");
  const crise = await carregarCrise(pool, criseId);
  if (!crise) return NAO_EXISTE;
  if (crise.Status !== "ATIVA") return MUDOU("Esta crise já foi encerrada.");
  const presidente = await presidenteAtual(pool);
  const v = cs.validarPortaVoz((dados || {}).portaVoz, { presidente });
  if (v.problema) return RECUSA(v.problema);
  const pv = await conferirPortaVoz(pool, v.portaVoz);
  if (pv.problema) return RECUSA(pv.problema);
  const p = pv.portaVoz, atual = portaVozDe(crise);
  if (p.tipo === atual.tipo && mesmo(p.membroId || -1, atual.membroId || -1) && p.nome === atual.nome && p.contato === atual.contato && (p.ato || null) === atual.ato) {
    return RECUSA("Nada mudou: o porta-voz já é este, com este contato.");
  }
  const texto = cs.textoAviso({ evento: "PORTA_VOZ", portaVoz: p, desde: cs.diaBrasilia(crise.AbertaEm) });
  const preparo = await com.prepararAvisoDoSistema(pool, { categoria: "CRISE", titulo: texto.titulo, corpo: texto.corpo, pessoas: await liderancaAtiva(pool),
    celular: cs.textoCelular({ evento: "PORTA_VOZ", portaVoz: p }) });
  const t = new sql.Transaction(pool);
  let envioId, historicoId;
  try {
    await t.begin();
    if (!(await obterTrava(() => new sql.Request(t), "crise-regime", 10000))) { await fecharTransacao(t, false); return OCUPADO("Outro ato da crise está sendo gravado. Tente de novo."); }
    const r = await new sql.Request(t).input("id", sql.Int, criseId).input("pt", sql.NVarChar(12), p.tipo).input("pm", sql.Int, p.membroId || null).input("pn", sql.NVarChar(150), p.nome)
      .input("pc", sql.NVarChar(150), p.contato).input("pa", sql.NVarChar(300), p.ato || null)
      .query(`UPDATE CriseRegimes SET PortaVozTipo = @pt, PortaVozMembroId = @pm, PortaVozNome = @pn, PortaVozContato = @pc, DesignacaoAto = @pa
              WHERE CriseId = @id AND Status = 'ATIVA'; SELECT @@ROWCOUNT AS n`);
    if (!contagem(r)) { await fecharTransacao(t, false); return MUDOU("A crise foi encerrada enquanto você decidia."); }
    await com.cancelarPendentesDoSistema(() => new sql.Request(t), await enviosDaCrise(new sql.Request(t), criseId));
    envioId = await com.gravarAvisoDoSistema(() => new sql.Request(t), preparo, { chave: chaveDoAviso(criseId, "PORTA_VOZ"), enviadoPor: ver.membroId, grupo: GRUPO_AVISO });
    historicoId = await insereHistorico(new sql.Request(t), { criseId, evento: "PORTA_VOZ", portaVoz: p, textoLivre: null, membroId: ver.membroId, envioId });
    await t.commit();
  } catch (e) { await fecharTransacao(t, false); throw e; }
  limparCacheFaixa();
  await auditar("CriseRegimes", criseId, "CRISE_PORTA_VOZ", ver.membroId);
  const mensagem = await depoisDoAto(pool, { ver, acao: "Porta-voz designado.", envioId, historicoId, inicio, deps, presidente, rotuloAto: "O porta-voz da crise foi trocado" });
  return { sucesso: true, mensagem, ...(await detalheCrise(pool, { ver, criseId })) };
}

async function encerrar(pool, { ver, criseId, dados, deps = {} }) {
  const inicio = Date.now();
  if (!ver.crise) return PROIBIDO("Encerrar o regime de crise é do nível geral (Presidente e Secretário Geral).");
  const v = cs.validarEncerramento(dados);
  if (v.problema) return RECUSA(v.problema);
  const crise = await carregarCrise(pool, criseId);
  if (!crise) return NAO_EXISTE;
  if (crise.Status !== "ATIVA") return MUDOU("Esta crise já foi encerrada.");
  const presidente = await presidenteAtual(pool);
  const texto = cs.textoAviso({ evento: "ENCERRADA", portaVoz: portaVozDe(crise), desde: cs.diaBrasilia(crise.AbertaEm), resumo: v.dados.resumo });
  const preparo = await com.prepararAvisoDoSistema(pool, { categoria: "CRISE", titulo: texto.titulo, corpo: texto.corpo, pessoas: await destinatariosDoFim(pool, criseId),
    celular: cs.textoCelular({ evento: "ENCERRADA" }) });
  const t = new sql.Transaction(pool);
  let envioId, historicoId;
  try {
    await t.begin();
    if (!(await obterTrava(() => new sql.Request(t), "crise-regime", 10000))) { await fecharTransacao(t, false); return OCUPADO("Outro ato da crise está sendo gravado. Tente de novo."); }
    // relida DENTRO da trava: o porta-voz que fica no histórico do fim é o de agora (a troca pode ter entrado entre a leitura de fora e a trava)
    const agora = (await new sql.Request(t).input("id", sql.Int, criseId).query(`SELECT * FROM CriseRegimes WITH (UPDLOCK, HOLDLOCK) WHERE CriseId = @id`)).recordset[0];
    if (!agora || agora.Status !== "ATIVA") { await fecharTransacao(t, false); return MUDOU("Esta crise já foi encerrada."); }
    const r = await new sql.Request(t).input("id", sql.Int, criseId).input("por", sql.Int, ver.membroId).input("rs", sql.NVarChar(500), v.dados.resumo)
      .query(`UPDATE CriseRegimes SET Status = 'ENCERRADA', EncerradaEm = SYSUTCDATETIME(), EncerradaPorMembroId = @por, ResumoEncerramento = @rs
              WHERE CriseId = @id AND Status = 'ATIVA'; SELECT @@ROWCOUNT AS n`);
    if (!contagem(r)) { await fecharTransacao(t, false); return MUDOU("Esta crise já foi encerrada."); }
    await com.cancelarPendentesDoSistema(() => new sql.Request(t), await enviosDaCrise(new sql.Request(t), criseId));
    envioId = await com.gravarAvisoDoSistema(() => new sql.Request(t), preparo, { chave: chaveDoAviso(criseId, "ENCERRADA"), enviadoPor: ver.membroId, grupo: GRUPO_AVISO });
    historicoId = await insereHistorico(new sql.Request(t), { criseId, evento: "ENCERRADA", portaVoz: portaVozDe(agora), textoLivre: v.dados.resumo, membroId: ver.membroId, envioId });
    await t.commit();
  } catch (e) { await fecharTransacao(t, false); throw e; }
  limparCacheFaixa();
  await auditar("CriseRegimes", criseId, "CRISE_ENCERRADA", ver.membroId);
  const mensagem = await depoisDoAto(pool, { ver, acao: "Regime de crise encerrado.", envioId, historicoId, inicio, deps, presidente, rotuloAto: "O regime de crise foi encerrado" });
  return { sucesso: true, mensagem, ...(await detalheCrise(pool, { ver, criseId })) };
}

// "Continuar o aviso agora": mais uma rodada (o celular de quem ficou para trás, em paralelo, e, dentro do teto da hora, mais e-mails). Só o nível geral da crise.
async function continuarAviso(pool, { ver, deps = {} }) {
  if (!ver.crise) return PROIBIDO("Só o nível geral da crise.");
  const r = await com.depoisDoAvisoDoSistema(pool, { deps, orcamentoCelularMs: 20000, orcamentoFilaMs: 6000 });
  const cel = (r && r.celular) || { aceitos: 0 };
  return { sucesso: true, celularEnviados: cel.aceitos, mensagem: `Mais uma rodada do aviso: ${cel.aceitos} celular(es) avisados agora. O e-mail respeita o limite de 100 por hora do serviço.` };
}

async function listarCrises(pool, { ver }) {
  if (!ver.crise) return null;
  const r = await pool.request().query(`SELECT TOP 50 x.*,
      (SELECT COUNT(*) FROM CriseManifestacoes m WHERE m.CriseId = x.CriseId) AS Manifestacoes,
      (SELECT COUNT(*) FROM CriseDemandasImprensa d WHERE d.CriseId = x.CriseId) AS Demandas
    FROM (${SELECT_CRISE}) x ORDER BY CASE x.Status WHEN 'ATIVA' THEN 0 ELSE 1 END, x.CriseId DESC`);
  return r.recordset.map((c) => ({ ...formatarCrise(c), manifestacoes: Number(c.Manifestacoes) || 0, demandas: Number(c.Demandas) || 0 }));
}
async function detalheCrise(pool, { ver, criseId }) {
  const c = await carregarCrise(pool, criseId);
  if (!c) return NAO_EXISTE;
  if (!ver.crise && !ehPortaVozDa(c, ver)) return NAO_EXISTE;
  const h = (await pool.request().input("id", sql.Int, criseId).query(`
    SELECT h.*, m.Nome AS PorNome FROM CriseHistorico h LEFT JOIN MembroReferencia m ON m.MembroId = h.MembroId WHERE h.CriseId = @id ORDER BY h.HistoricoId`)).recordset;
  const historico = [];
  for (const x of h) {
    historico.push({ evento: x.Evento, em: iso(x.Em), por: x.PorNome || null, portaVoz: portaVozDe(x), texto: ver.crise ? x.Texto || null : null,
      aviso: x.EnvioId && ver.crise ? await com.situacaoDoAvisoDoSistema(pool, x.EnvioId) : null });
  }
  const crise = formatarCrise(c);
  if (!ver.crise) crise.motivo = null;      // o porta-voz designado vê o regime, o histórico de porta-vozes e as manifestações; o motivo registrado fica com o nível geral
  return { crise, historico, manifestacoes: await listarManifestacoes(pool, criseId) };
}

// ---------------------------------------------------------------
// Manifestações autorizadas
// ---------------------------------------------------------------

async function listarManifestacoes(pool, criseId) {
  const r = await pool.request().input("id", sql.Int, criseId).query(`
    SELECT x.*, p.Nome AS RegistradoPorNome, (SELECT TOP 1 y.ManifestacaoId FROM CriseManifestacoes y WHERE y.CorrigeManifestacaoId = x.ManifestacaoId) AS CorrigidaPor
    FROM CriseManifestacoes x LEFT JOIN MembroReferencia p ON p.MembroId = x.RegistradoPorMembroId WHERE x.CriseId = @id ORDER BY x.DataHora DESC, x.ManifestacaoId DESC`);
  return r.recordset.map((x) => ({ manifestacaoId: x.ManifestacaoId, dataHora: iso(x.DataHora), canal: x.Canal, canalRotulo: cs.CANAIS_MANIFESTACAO[x.Canal] || x.Canal, quemFalou: x.QuemFalou,
    resumo: x.Resumo, link: x.Link || null, documento: x.Documento || null, autorizadoPor: x.AutorizadoPor, corrige: x.CorrigeManifestacaoId || null, corrigidaPor: x.CorrigidaPor || null,
    registradoPor: x.RegistradoPorNome || null, registradoEm: iso(x.RegistradoEm) }));
}
// Na crise ativa: o porta-voz ou o nível geral. Numa crise já encerrada (o que foi dito no último dia e só registrado depois): só o nível geral.
async function registrarManifestacao(pool, { ver, dados }) {
  const d = dados || {};
  const criseId = cs.inteiroPositivo(d.criseId);
  if (!criseId) return RECUSA("Escolha a crise.");
  const crise = await carregarCrise(pool, criseId);
  if (!crise) return NAO_EXISTE;
  if (!ver.crise && !ehPortaVozDa(crise, ver)) return crise.Status === "ATIVA" ? PROIBIDO("Só o porta-voz e o nível geral registram manifestação.") : NAO_EXISTE;
  const v = cs.validarManifestacao(d, { abertaEm: crise.AbertaEm });
  if (v.problema) return RECUSA(v.problema);
  const x = v.dados;
  const t = new sql.Transaction(pool);
  let id;
  try {
    await t.begin();
    // a MESMA trava dos atos do regime (abrir, trocar o porta-voz, encerrar): quem pode e até quando é conferido de novo DENTRO dela (revisão independente, v7.15)
    if (!(await obterTrava(() => new sql.Request(t), "crise-regime", 8000))) { await fecharTransacao(t, false); return OCUPADO("Outro registro da crise está sendo gravado. Tente de novo."); }
    const agora = (await new sql.Request(t).input("id", sql.Int, criseId).query(`SELECT * FROM CriseRegimes WHERE CriseId = @id`)).recordset[0];
    if (!ver.crise && !ehPortaVozDa(agora, ver)) { await fecharTransacao(t, false); return PROIBIDO("Você deixou de ser o porta-voz desta crise (ou ela foi encerrada)."); }
    // na crise encerrada, o nível geral registra só o que foi dito ATÉ o encerramento
    if (agora.Status === "ENCERRADA" && x.dataHora.getTime() > new Date(agora.EncerradaEm).getTime()) {
      await fecharTransacao(t, false);
      return RECUSA("A crise já tinha sido encerrada nessa data e hora: registre só o que foi dito até o encerramento.");
    }
    if (x.corrigeManifestacaoId) {
      const alvo = (await new sql.Request(t).input("id", sql.Int, x.corrigeManifestacaoId).query(`
        SELECT CriseId, (SELECT COUNT(*) FROM CriseManifestacoes y WITH (UPDLOCK, HOLDLOCK) WHERE y.CorrigeManifestacaoId = @id) AS Corrigida FROM CriseManifestacoes WHERE ManifestacaoId = @id`)).recordset[0];
      if (!alvo || !mesmo(alvo.CriseId, criseId)) { await fecharTransacao(t, false); return NAO_EXISTE; }
      if (Number(alvo.Corrigida)) { await fecharTransacao(t, false); return MUDOU("Esta manifestação já foi corrigida: corrija a versão mais nova."); }
    }
    id = (await new sql.Request(t).input("c", sql.Int, criseId).input("dh", sql.DateTime2, x.dataHora).input("ca", sql.NVarChar(12), x.canal).input("qf", sql.NVarChar(150), x.quemFalou)
      .input("rs", sql.NVarChar(2000), x.resumo).input("li", sql.NVarChar(500), x.link).input("doc", sql.NVarChar(300), x.documento).input("au", sql.NVarChar(150), x.autorizadoPor)
      .input("co", sql.Int, x.corrigeManifestacaoId).input("por", sql.Int, ver.membroId)
      .query(`INSERT INTO CriseManifestacoes (CriseId, DataHora, Canal, QuemFalou, Resumo, Link, Documento, AutorizadoPor, CorrigeManifestacaoId, RegistradoPorMembroId)
              VALUES (@c, @dh, @ca, @qf, @rs, @li, @doc, @au, @co, @por); SELECT CAST(SCOPE_IDENTITY() AS INT) AS id`)).recordset[0].id;
    await t.commit();
  } catch (e) { await fecharTransacao(t, false); throw e; }
  await auditar("CriseManifestacoes", id, x.corrigeManifestacaoId ? "CRISE_MANIFESTACAO_CORRECAO" : "CRISE_MANIFESTACAO", ver.membroId);
  return { sucesso: true, manifestacaoId: id, mensagem: "Manifestação registrada.", manifestacoes: await listarManifestacoes(pool, criseId) };
}

// ---------------------------------------------------------------
// Demandas de imprensa
// ---------------------------------------------------------------

// Quem recebe o aviso do pedido da imprensa: quem tem crise_gestao numa concessão GERAL (nível Global, todas as congregações) pela Liderança vigente ou por uma delegação
// vigente dela, e o porta-voz da crise ativa — todos membros ativos e sem exclusão LGPD atendida (revisão independente, v7.15).
async function destinatariosDaImprensa(pool, crise) {
  const r = await pool.request().input("perm", sql.NVarChar(60), `%,${cs.PERMISSAO_CRISE},%`).input("pv", sql.Int, crise && crise.PortaVozMembroId ? crise.PortaVozMembroId : null).query(`
    WITH gestao AS (
      SELECT l.MembroId FROM Lideranca l JOIN Papeis p ON p.PapelId = l.PapelId
      WHERE (',' + p.Permissoes + ',') LIKE @perm AND p.Nivel = 'GLOBAL' AND ${LIDERANCA_ATIVA_SQL}
      UNION
      SELECT g.DelegadoMembroId FROM DelegacoesAcesso g JOIN Lideranca l ON l.LiderancaId = g.LiderancaId JOIN Papeis p ON p.PapelId = l.PapelId
      WHERE (',' + p.Permissoes + ',') LIKE @perm AND p.Nivel = 'GLOBAL' AND g.Status = 'ATIVA' AND CAST(SYSUTCDATETIME() AS DATE) BETWEEN g.DataInicio AND g.DataFim
      UNION
      SELECT @pv WHERE @pv IS NOT NULL)
    SELECT DISTINCT m.MembroId AS membroId, m.Nome AS nome, m.Email AS email FROM gestao x JOIN MembroReferencia m ON m.MembroId = x.MembroId
    WHERE m.Status = 'ATIVO' AND NOT ${EXCLUIDO_SQL}`);
  return r.recordset;
}
// Quem administra os pedidos: o nível geral da crise e o porta-voz da crise ativa.
async function papelNaImprensa(pool, ver) {
  if (ver.crise) return { gestor: true, crise: await criseAtiva(pool) };
  const crise = await criseAtiva(pool);
  return { gestor: ehPortaVozDa(crise, ver), crise, soPortaVoz: true };
}
async function registrarDemanda(pool, { ver, dados, deps = {} }) {
  const v = cs.validarDemanda(dados);
  if (v.problema) return RECUSA(v.problema);
  const x = v.dados;
  const hoje = contagem(await pool.request().input("m", sql.Int, ver.membroId)
    .query(`SELECT COUNT(*) AS n FROM CriseDemandasImprensa WHERE RegistradoPorMembroId = @m AND RecebidaEm >= DATEADD(HOUR, -24, SYSUTCDATETIME())`));
  if (hoje >= MAX_DEMANDAS_DIA) return OCUPADO("Muitos pedidos registrados nas últimas 24 horas. Fale com a Secretaria.");
  const { gestor, crise } = await papelNaImprensa(pool, ver);
  let criseId = crise ? crise.CriseId : null;
  const t = new sql.Transaction(pool);
  let id;
  try {
    await t.begin();
    if (x.corrigeDemandaId) {
      if (!(await obterTrava(() => new sql.Request(t), `crise-demanda-${x.corrigeDemandaId}`, 8000))) { await fecharTransacao(t, false); return OCUPADO("Outra correção está sendo gravada. Tente de novo."); }
      const alvo = (await new sql.Request(t).input("id", sql.Int, x.corrigeDemandaId).query(`
        SELECT CriseId, RegistradoPorMembroId, (SELECT COUNT(*) FROM CriseDemandasImprensa y WITH (UPDLOCK, HOLDLOCK) WHERE y.CorrigeDemandaId = @id) AS Corrigida
        FROM CriseDemandasImprensa WHERE DemandaId = @id`)).recordset[0];
      // corrige quem registrou, o nível geral e o porta-voz SÓ no alcance da lista dele (os pedidos da crise ativa); fora disso, 404 antes de dizer se já foi corrigido
      const alcanca = ver.crise || mesmo(alvo && alvo.RegistradoPorMembroId, ver.membroId) || (gestor && crise && alvo && mesmo(alvo.CriseId, crise.CriseId));
      if (!alvo || !alcanca) { await fecharTransacao(t, false); return NAO_EXISTE; }
      if (Number(alvo.Corrigida)) { await fecharTransacao(t, false); return MUDOU("Este pedido já foi corrigido: corrija a versão mais nova."); }
      criseId = alvo.CriseId || null;     // a correção fica na mesma crise do pedido original
    }
    id = (await new sql.Request(t).input("c", sql.Int, criseId).input("ve", sql.NVarChar(150), x.veiculo).input("ct", sql.NVarChar(150), x.contato).input("pe", sql.NVarChar(2000), x.pedido)
      .input("pr", sql.DateTime2, x.prazo).input("co", sql.Int, x.corrigeDemandaId).input("por", sql.Int, ver.membroId)
      .query(`INSERT INTO CriseDemandasImprensa (CriseId, Veiculo, Contato, Pedido, PrazoEm, CorrigeDemandaId, RegistradoPorMembroId)
              VALUES (@c, @ve, @ct, @pe, @pr, @co, @por); SELECT CAST(SCOPE_IDENTITY() AS INT) AS id`)).recordset[0].id;
    await t.commit();
  } catch (e) { await fecharTransacao(t, false); throw e; }
  await auditar("CriseDemandasImprensa", id, x.corrigeDemandaId ? "CRISE_DEMANDA_CORRECAO" : "CRISE_DEMANDA", ver.membroId);
  // o encaminhamento: o nível geral da crise e o porta-voz (se for membro ativo) recebem na hora, no sininho e no celular (nunca quem registrou). Teto (revisão independente,
  // v7.15): no máximo 10 avisos destes por destinatário em 24 horas, e o celular só no 1º pedido de cada líder na hora — um líder não enche o celular do Presidente.
  if (!x.corrigeDemandaId) {
    const destinos = await destinatariosDaImprensa(pool, crise);
    const prazo = x.prazo ? ` Prazo: ${dataHoraBr(x.prazo)}.` : "";
    const naHora = contagem(await pool.request().input("m", sql.Int, ver.membroId).input("id", sql.Int, id)
      .query(`SELECT COUNT(*) AS n FROM CriseDemandasImprensa WHERE RegistradoPorMembroId = @m AND DemandaId <> @id AND RecebidaEm >= DATEADD(HOUR, -1, SYSUTCDATETIME())`));
    const enviarCanais = deps.enviarCanais || ((p, o) => require("./notificacaoMotor").enviarCanaisNotificacao(p, o));
    const semCelular = naHora > 0 ? { ...deps, enviarCanais: (p, o) => enviarCanais(p, { ...o, regra: { ...o.regra, CanalPush: false } }) } : deps;
    await notificarAgora(pool, { regraChave: "CRISE_DEMANDA_IMPRENSA", destinatarios: destinos.filter((dd) => !mesmo(dd.membroId, ver.membroId)), referenciaTabela: "CriseDemandasImprensa", referenciaId: id,
      limiteDia: AVISOS_IMPRENSA_DIA, mensagem: `${x.veiculo} pediu: ${x.pedido.slice(0, 300)}${x.pedido.length > 300 ? "…" : ""}${prazo} Veja em Crise e segurança → Imprensa.`, deps: semCelular });
  }
  return { sucesso: true, demandaId: id, mensagem: crise ? "Pedido registrado e encaminhado ao porta-voz. Não comente o assunto com a imprensa." : "Pedido registrado e encaminhado à Presidência." };
}
// O gestor (nível geral da crise ou porta-voz) vê todos os pedidos (os mais novos primeiro, até 200); os outros líderes, só os que registraram.
async function listarDemandas(pool, { ver }) {
  const { gestor, crise, soPortaVoz } = await papelNaImprensa(pool, ver);
  const rq = pool.request().input("eu", sql.Int, ver.membroId);
  let filtro = "d.RegistradoPorMembroId = @eu";
  if (gestor && !soPortaVoz) filtro = "1 = 1";
  // o porta-voz vê os pedidos da crise ativa (e os que ele registrou); os de fora da crise (e o contato do jornalista deles) ficam só com o nível geral
  else if (gestor) { rq.input("c", sql.Int, crise.CriseId); filtro = "(d.CriseId = @c OR d.RegistradoPorMembroId = @eu)"; }
  const r = await rq.query(`
    SELECT TOP 200 d.*, p.Nome AS RegistradoPorNome, (SELECT TOP 1 y.DemandaId FROM CriseDemandasImprensa y WHERE y.CorrigeDemandaId = d.DemandaId) AS CorrigidaPor
    FROM CriseDemandasImprensa d LEFT JOIN MembroReferencia p ON p.MembroId = d.RegistradoPorMembroId WHERE ${filtro} ORDER BY d.DemandaId DESC`);
  const ids = r.recordset.map((d) => d.DemandaId);
  const respostas = ids.length ? (await pool.request().input("ids", sql.NVarChar(sql.MAX), JSON.stringify(ids)).query(`
    SELECT r.*, p.Nome AS RespondidoPorNome FROM CriseDemandaRespostas r LEFT JOIN MembroReferencia p ON p.MembroId = r.RespondidoPorMembroId
    WHERE r.DemandaId IN (SELECT CAST(value AS INT) FROM OPENJSON(@ids)) ORDER BY r.RespostaId`)).recordset : [];
  const porDemanda = new Map();
  for (const x of respostas) { if (!porDemanda.has(x.DemandaId)) porDemanda.set(x.DemandaId, []); porDemanda.get(x.DemandaId).push(x); }
  const podeResponder = (d) => gestor && (!soPortaVoz || mesmo(d.CriseId, crise.CriseId));
  return {
    gestor, criseAtivaId: crise ? crise.CriseId : null,
    demandas: r.recordset.map((d) => {
      const rs = porDemanda.get(d.DemandaId) || [];
      const ultima = rs[rs.length - 1] || null;
      return {
        demandaId: d.DemandaId, criseId: d.CriseId || null, veiculo: d.Veiculo, contato: d.Contato || null, contatoApagado: !!d.ContatoApagadoEm, pedido: d.Pedido, prazoEm: iso(d.PrazoEm),
        recebidaEm: iso(d.RecebidaEm), registradoPor: d.RegistradoPorNome || null, minha: mesmo(d.RegistradoPorMembroId, ver.membroId), corrige: d.CorrigeDemandaId || null,
        corrigidaPor: d.CorrigidaPor || null, situacao: ultima ? ultima.Situacao : "RECEBIDA", situacaoRotulo: cs.SITUACOES_DEMANDA[ultima ? ultima.Situacao : "RECEBIDA"],
        ultimaRespostaId: ultima ? ultima.RespostaId : null, podeResponder: podeResponder(d) && !d.CorrigidaPor,
        respostas: rs.map((x) => ({ respostaId: x.RespostaId, situacao: x.Situacao, resposta: x.Resposta, em: iso(x.Em), por: x.RespondidoPorNome || null, substitui: x.SubstituiRespostaId || null }))
      };
    })
  };
}
async function responderDemanda(pool, { ver, dados }) {
  const d = dados || {};
  const demandaId = cs.inteiroPositivo(d.demandaId);
  if (!demandaId) return RECUSA("Escolha o pedido.");
  const { gestor, crise, soPortaVoz } = await papelNaImprensa(pool, ver);
  const alvo = (await pool.request().input("id", sql.Int, demandaId).query(`
    SELECT d.DemandaId, d.CriseId, d.RegistradoPorMembroId, (SELECT COUNT(*) FROM CriseDemandasImprensa y WHERE y.CorrigeDemandaId = d.DemandaId) AS Corrigida
    FROM CriseDemandasImprensa d WHERE d.DemandaId = @id`)).recordset[0];
  if (!alvo) return NAO_EXISTE;
  if (!gestor || (soPortaVoz && !mesmo(alvo.CriseId, crise.CriseId))) {
    return mesmo(alvo.RegistradoPorMembroId, ver.membroId) ? PROIBIDO("Quem responde a imprensa é o porta-voz (ou o nível geral).") : NAO_EXISTE;
  }
  if (Number(alvo.Corrigida)) return RECUSA("Este pedido foi corrigido: responda a versão nova.");
  const v = cs.validarResposta(d);
  if (v.problema) return RECUSA(v.problema);
  const t = new sql.Transaction(pool);
  let id, esperada = null;
  try {
    await t.begin();
    // a trava dos atos do regime: o porta-voz é conferido de novo DENTRO dela (a troca do porta-voz não passa no meio)
    if (!(await obterTrava(() => new sql.Request(t), "crise-regime", 8000))) { await fecharTransacao(t, false); return OCUPADO("Outra resposta está sendo gravada. Tente de novo."); }
    if (!ver.crise) {
      const ativa = (await new sql.Request(t).query(`SELECT TOP 1 * FROM CriseRegimes WHERE Status = 'ATIVA'`)).recordset[0] || null;
      if (!ehPortaVozDa(ativa, ver) || !mesmo(alvo.CriseId, ativa.CriseId)) { await fecharTransacao(t, false); return PROIBIDO("Você deixou de ser o porta-voz desta crise (ou ela foi encerrada)."); }
    }
    const ultima = (await new sql.Request(t).input("id", sql.Int, demandaId)
      .query(`SELECT TOP 1 RespostaId FROM CriseDemandaRespostas WITH (UPDLOCK, HOLDLOCK) WHERE DemandaId = @id ORDER BY RespostaId DESC`)).recordset[0];
    esperada = ultima ? ultima.RespostaId : null;
    if ((v.dados.substituiRespostaId || null) !== esperada) {
      await fecharTransacao(t, false);
      return MUDOU(esperada ? "Este pedido foi respondido enquanto você escrevia: leia a resposta e, se precisar, corrija." : "Recarregue o pedido antes de responder.");
    }
    id = (await new sql.Request(t).input("d", sql.Int, demandaId).input("s", sql.Int, esperada).input("si", sql.NVarChar(10), v.dados.situacao).input("rs", sql.NVarChar(2000), v.dados.resposta)
      .input("por", sql.Int, ver.membroId)
      .query(`INSERT INTO CriseDemandaRespostas (DemandaId, SubstituiRespostaId, Situacao, Resposta, RespondidoPorMembroId) VALUES (@d, @s, @si, @rs, @por); SELECT CAST(SCOPE_IDENTITY() AS INT) AS id`)).recordset[0].id;
    await t.commit();
  } catch (e) { await fecharTransacao(t, false); throw e; }
  await auditar("CriseDemandaRespostas", id, esperada ? "CRISE_RESPOSTA_CORRECAO" : `CRISE_DEMANDA_${v.dados.situacao}`, ver.membroId);
  return { sucesso: true, respostaId: id, mensagem: esperada ? "Resposta corrigida (a anterior fica no histórico)." : "Resposta registrada." };
}

// ---------------------------------------------------------------
// Segurança da congregação
// ---------------------------------------------------------------

// `ver.seguranca` e `ver.geralSeguranca`; null = todas (nível geral); senão os ids das congregações que a pessoa alcança. O filtro vai no banco, antes do TOP.
async function idsDoTerritorio(pool, ver) {
  if (!ver || !ver.seguranca) return [];
  if (ver.geralSeguranca) return null;
  const r = await pool.request().query(`SELECT CongregacaoId, Nome FROM Congregacoes`);
  return r.recordset.filter((c) => ver.podeVerCongregacao(c.Nome)).map((c) => c.CongregacaoId);
}
function filtroDeIds(rq, coluna, ids, prefixo = "t") {
  if (ids === null) return "1 = 1";
  if (!ids.length) return "1 = 0";
  return `${coluna} IN (${ids.map((id, i) => { rq.input(`${prefixo}${i}`, sql.Int, id); return `@${prefixo}${i}`; }).join(", ")})`;
}
async function congregacaoAlcancada(pool, ver, congregacaoId) {
  if (!ver || !ver.seguranca || !congregacaoId) return null;
  const c = (await pool.request().input("c", sql.Int, congregacaoId).query(`SELECT CongregacaoId, Nome, AreaId FROM Congregacoes WHERE CongregacaoId = @c`)).recordset[0];
  if (!c) return null;
  return ver.geralSeguranca || ver.podeVerCongregacao(c.Nome) ? c : null;
}
async function lerPrazos(pool) {
  const lidos = {};
  for (const sigla of Object.keys(cs.PRAZOS_PADRAO)) lidos[sigla] = await lerPrazoDias(pool, sigla, cs.PRAZOS_PADRAO[sigla]);
  return cs.prazosDaSeguranca(lidos);
}
// Os fatos de cada congregação (ids: null = todas): o plano, o último simulado, a última vistoria e as pendências dela, a equipe ativa, os imóveis com AVCB e seguro.
async function fatosDasCongregacoes(pool, ids, hoje) {
  const rq = pool.request().input("hoje", sql.Date, hoje);
  const congs = (await rq.query(`
    SELECT c.CongregacaoId, c.Nome, c.AreaId,
      (SELECT TOP 1 p.Versao FROM SegurancaPlanos p WHERE p.CongregacaoId = c.CongregacaoId ORDER BY p.Versao DESC) AS PlanoVersao,
      (SELECT TOP 1 p.RevisadoEm FROM SegurancaPlanos p WHERE p.CongregacaoId = c.CongregacaoId ORDER BY p.Versao DESC) AS PlanoRevisadoEm,
      (SELECT MAX(s.Data) FROM SegurancaSimulados s WHERE s.CongregacaoId = c.CongregacaoId AND s.AnuladoEm IS NULL) AS UltimoSimulado,
      (SELECT MAX(v.Data) FROM SegurancaVistorias v WHERE v.CongregacaoId = c.CongregacaoId AND v.AnuladoEm IS NULL) AS UltimaVistoria,
      (SELECT COUNT(*) FROM SegurancaVistoriaItens i JOIN SegurancaVistorias v ON v.VistoriaId = i.VistoriaId
         WHERE v.CongregacaoId = c.CongregacaoId AND v.AnuladoEm IS NULL AND i.Resultado = 'PENDENTE' AND i.ResolvidaEm IS NULL) AS Pendencias,   -- de TODA vistoria não anulada: a pendência só sai quando é marcada resolvida
      (SELECT COUNT(*) FROM SegurancaEquipe e JOIN MembroReferencia m ON m.MembroId = e.MembroId WHERE e.CongregacaoId = c.CongregacaoId AND e.EncerradoEm IS NULL
         AND m.Status = 'ATIVO' AND m.CongregacaoId = e.CongregacaoId AND (e.Ate IS NULL OR e.Ate >= @hoje)) AS Equipe
    FROM Congregacoes c WHERE c.Ativa = 1 AND ${filtroDeIds(rq, "c.CongregacaoId", ids, "e")} ORDER BY c.Nome`)).recordset;
  const imoveis = new Map();
  if (congs.length) {
    const rqi = pool.request().input("hoje", sql.Date, hoje);
    const lista = (await rqi.query(`
      SELECT b.BemId, b.CongregacaoId, b.Descricao, f.AvcbNumero, f.AvcbVigenciaFim,
        (SELECT MAX(a.DataFim) FROM ApolicesSeguro a WHERE a.BemId = b.BemId AND a.Status = 'ATIVA') AS SeguroFim,
        CASE WHEN EXISTS (SELECT 1 FROM ApolicesSeguro a WHERE a.BemId = b.BemId AND a.Status = 'ATIVA' AND a.DataInicio <= @hoje AND a.DataFim >= @hoje) THEN 1 ELSE 0 END AS SeguroVigente
      FROM BensPatrimoniais b LEFT JOIN ImoveisSituacaoFiscal f ON f.BemId = b.BemId
      WHERE b.Tipo = 'IMOVEL' AND b.Status = 'ATIVO' AND ${filtroDeIds(rqi, "b.CongregacaoId", congs.map((c) => c.CongregacaoId), "i")}`)).recordset;
    for (const b of lista) {
      if (!imoveis.has(b.CongregacaoId)) imoveis.set(b.CongregacaoId, []);
      const fim = dia(b.SeguroFim);
      imoveis.get(b.CongregacaoId).push({ bemId: b.BemId, descricao: b.Descricao, avcbNumero: b.AvcbNumero || null, avcbVigenciaFim: dia(b.AvcbVigenciaFim),
        seguro: Number(b.SeguroVigente) ? "VIGENTE" : fim && fim < hoje ? "VENCIDO" : "SEM_SEGURO", seguroFim: fim });
    }
  }
  return congs.map((c) => ({ ...c, imoveis: imoveis.get(c.CongregacaoId) || [] }));
}
function avaliar(c, hoje, prazos) {
  return cs.avaliarSeguranca({ hoje, prazos, plano: c.PlanoVersao ? { versao: c.PlanoVersao, revisadoEm: c.PlanoRevisadoEm } : null, simulado: dia(c.UltimoSimulado),
    vistoria: dia(c.UltimaVistoria), pendencias: Number(c.Pendencias) || 0, imoveis: c.imoveis });
}
async function painelSeguranca(pool, { ver, hoje = hojeBrasilia() }) {
  const ids = await idsDoTerritorio(pool, ver);
  const prazos = await lerPrazos(pool);
  return (await fatosDasCongregacoes(pool, ids, hoje)).map((c) => {
    const a = avaliar(c, hoje, prazos);
    return { congregacaoId: c.CongregacaoId, nome: c.Nome, equipe: Number(c.Equipe) || 0, pendencias: Number(c.Pendencias) || 0, plano: a.plano, simulado: a.simulado,
      vistoria: a.vistoria, imoveis: a.imoveis, alertas: a.alertas.map((x) => ({ codigo: x.codigo, texto: x.texto })) };
  });
}
const anulacao = (x) => (x.AnuladoEm ? { anuladoEm: iso(x.AnuladoEm), anuladoPor: x.AnuladoPorNome || null, motivo: x.MotivoAnulacao } : null);
async function detalheSeguranca(pool, { ver, congregacaoId, hoje = hojeBrasilia() }) {
  const c = await congregacaoAlcancada(pool, ver, congregacaoId);
  if (!c) return null;
  const prazos = await lerPrazos(pool);
  const fatos = (await fatosDasCongregacoes(pool, [congregacaoId], hoje))[0];
  const a = fatos ? avaliar(fatos, hoje, prazos) : cs.avaliarSeguranca({ hoje, prazos });
  const rq = () => pool.request().input("c", sql.Int, congregacaoId).input("hoje", sql.Date, hoje);
  const planos = (await rq().query(`SELECT TOP 30 p.*, m.Nome AS PorNome FROM SegurancaPlanos p LEFT JOIN MembroReferencia m ON m.MembroId = p.RegistradoPorMembroId
    WHERE p.CongregacaoId = @c ORDER BY p.Versao DESC`)).recordset;
  const simulados = (await rq().query(`SELECT TOP 50 s.*, m.Nome AS PorNome, a.Nome AS AnuladoPorNome FROM SegurancaSimulados s LEFT JOIN MembroReferencia m ON m.MembroId = s.RegistradoPorMembroId
    LEFT JOIN MembroReferencia a ON a.MembroId = s.AnuladoPorMembroId WHERE s.CongregacaoId = @c ORDER BY s.Data DESC, s.SimuladoId DESC`)).recordset;
  const vistorias = (await rq().query(`SELECT TOP 20 v.*, m.Nome AS PorNome, a.Nome AS AnuladoPorNome FROM SegurancaVistorias v LEFT JOIN MembroReferencia m ON m.MembroId = v.RegistradoPorMembroId
    LEFT JOIN MembroReferencia a ON a.MembroId = v.AnuladoPorMembroId WHERE v.CongregacaoId = @c ORDER BY v.Data DESC, v.VistoriaId DESC`)).recordset;
  const itens = vistorias.length ? (await pool.request().input("ids", sql.NVarChar(sql.MAX), JSON.stringify(vistorias.map((v) => v.VistoriaId))).query(`
    SELECT i.*, m.Nome AS ResolvidaPorNome FROM SegurancaVistoriaItens i LEFT JOIN MembroReferencia m ON m.MembroId = i.ResolvidaPorMembroId
    WHERE i.VistoriaId IN (SELECT CAST(value AS INT) FROM OPENJSON(@ids)) ORDER BY i.VistoriaItemId`)).recordset : [];
  const ordemItem = Object.keys(cs.ITENS_VISTORIA);
  const equipe = (await rq().query(`SELECT TOP 200 e.*, m.Nome AS MembroNome, m.Status AS MembroStatus, m.CongregacaoId AS MembroCongregacaoId, p.Nome AS PorNome
    FROM SegurancaEquipe e LEFT JOIN MembroReferencia m ON m.MembroId = e.MembroId LEFT JOIN MembroReferencia p ON p.MembroId = e.RegistradoPorMembroId
    WHERE e.CongregacaoId = @c ORDER BY CASE WHEN e.EncerradoEm IS NULL THEN 0 ELSE 1 END, e.Funcao, e.Desde DESC, e.EquipeId DESC`)).recordset;
  const atual = planos[0] || null;
  return {
    congregacao: { congregacaoId: c.CongregacaoId, nome: c.Nome }, plano: a.plano, simulado: a.simulado, vistoria: a.vistoria, imoveis: a.imoveis,
    alertas: a.alertas.map((x) => ({ codigo: x.codigo, texto: x.texto })), contatosEmergencia: cs.CONTATOS_EMERGENCIA,
    planoAtual: atual ? { versao: atual.Versao, rotasEvacuacao: atual.RotasEvacuacao, pontosEncontro: atual.PontosEncontro, contatosLocais: atual.ContatosLocais || null,
      responsaveis: atual.Responsaveis, revisadoEm: iso(atual.RevisadoEm), registradoPor: atual.PorNome || null } : null,
    versoesDoPlano: planos.map((p) => ({ versao: p.Versao, revisadoEm: iso(p.RevisadoEm), registradoPor: p.PorNome || null })),
    simulados: simulados.map((s) => ({ simuladoId: s.SimuladoId, data: dia(s.Data), tipo: s.Tipo, tipoRotulo: cs.TIPOS_SIMULADO[s.Tipo] || s.Tipo, participantes: s.Participantes,
      duracaoMinutos: s.DuracaoMinutos, correuBem: s.CorreuBem || null, melhorar: s.Melhorar || null, registradoPor: s.PorNome || null, anulacao: anulacao(s) })),
    vistorias: vistorias.map((v) => ({ vistoriaId: v.VistoriaId, data: dia(v.Data), observacoes: v.Observacoes || null, registradoPor: v.PorNome || null, anulacao: anulacao(v),
      itens: itens.filter((i) => i.VistoriaId === v.VistoriaId).sort((x, y) => ordemItem.indexOf(x.Item) - ordemItem.indexOf(y.Item)).map((i) => ({
        vistoriaItemId: i.VistoriaItemId, item: i.Item, itemRotulo: (cs.ITENS_VISTORIA[i.Item] || {}).rotulo || i.Item, resultado: i.Resultado, pendencia: i.Pendencia || null,
        resolvidaEm: iso(i.ResolvidaEm), resolvidaPor: i.ResolvidaPorNome || null, comoResolvida: i.ComoResolvida || null })) })),
    equipe: equipe.map((e) => {
      const saiu = !e.EncerradoEm && (!e.MembroId || e.MembroStatus !== "ATIVO" || !mesmo(e.MembroCongregacaoId, e.CongregacaoId));
      return { equipeId: e.EquipeId, nome: e.MembroId ? e.MembroNome : "(nome removido)", funcao: e.Funcao, funcaoRotulo: cs.FUNCOES_EQUIPE[e.Funcao] || e.Funcao, desde: dia(e.Desde),
        ate: dia(e.Ate), ativo: !e.EncerradoEm && !saiu && (!e.Ate || dia(e.Ate) >= hoje), saiuDaCongregacao: saiu, encerradoEm: iso(e.EncerradoEm), motivo: e.MotivoEncerramento || null };
    })
  };
}

async function salvarPlano(pool, { ver, congregacaoId, dados }) {
  const c = await congregacaoAlcancada(pool, ver, congregacaoId);
  if (!c) return NAO_EXISTE;
  const v = cs.validarPlano(dados);
  if (v.problema) return RECUSA(v.problema);
  const x = v.dados;
  const t = new sql.Transaction(pool);
  let versao;
  try {
    await t.begin();
    if (!(await obterTrava(() => new sql.Request(t), `seguranca-plano-${congregacaoId}`, 8000))) { await fecharTransacao(t, false); return OCUPADO("O plano está sendo gravado por outra pessoa. Tente de novo."); }
    const atual = Number((await new sql.Request(t).input("c", sql.Int, congregacaoId).query(`SELECT ISNULL(MAX(Versao), 0) AS n FROM SegurancaPlanos WITH (UPDLOCK, HOLDLOCK) WHERE CongregacaoId = @c`)).recordset[0].n);
    if (atual !== x.versaoAtual) { await fecharTransacao(t, false); return MUDOU("Outra pessoa salvou o plano enquanto você escrevia: recarregue e confira antes de salvar."); }
    versao = atual + 1;
    await new sql.Request(t).input("c", sql.Int, congregacaoId).input("v", sql.Int, versao).input("ro", sql.NVarChar(2000), x.rotasEvacuacao).input("po", sql.NVarChar(1000), x.pontosEncontro)
      .input("co", sql.NVarChar(1000), x.contatosLocais).input("re", sql.NVarChar(1000), x.responsaveis).input("por", sql.Int, ver.membroId)
      .query(`INSERT INTO SegurancaPlanos (CongregacaoId, Versao, RotasEvacuacao, PontosEncontro, ContatosLocais, Responsaveis, RegistradoPorMembroId) VALUES (@c, @v, @ro, @po, @co, @re, @por)`);
    await t.commit();
  } catch (e) { await fecharTransacao(t, false); throw e; }
  await auditar("SegurancaPlanos", congregacaoId, "SEGURANCA_PLANO_REVISADO", ver.membroId);
  return { sucesso: true, versao, mensagem: versao === 1 ? "Plano de emergência registrado." : `Plano revisado (versão ${versao}).` };
}

async function registrarSimulado(pool, { ver, congregacaoId, dados, hoje = hojeBrasilia() }) {
  const c = await congregacaoAlcancada(pool, ver, congregacaoId);
  if (!c) return NAO_EXISTE;
  const v = cs.validarSimulado(dados, { hoje });
  if (v.problema) return RECUSA(v.problema);
  const x = v.dados;
  const t = new sql.Transaction(pool);
  let id;
  try {
    await t.begin();
    if (!(await obterTrava(() => new sql.Request(t), `seguranca-simulado-${congregacaoId}`, 8000))) { await fecharTransacao(t, false); return OCUPADO("Outro simulado está sendo gravado. Tente de novo."); }
    const igual = contagem(await new sql.Request(t).input("c", sql.Int, congregacaoId).input("d", sql.Date, x.data).input("t", sql.NVarChar(20), x.tipo)
      .query(`SELECT COUNT(*) AS n FROM SegurancaSimulados WHERE CongregacaoId = @c AND Data = @d AND Tipo = @t AND AnuladoEm IS NULL`));
    if (igual) { await fecharTransacao(t, false); return RECUSA("Já há um simulado deste tipo nesta data. Se o registro está errado, anule-o e registre de novo."); }
    id = (await new sql.Request(t).input("c", sql.Int, congregacaoId).input("d", sql.Date, x.data).input("t", sql.NVarChar(20), x.tipo).input("p", sql.Int, x.participantes)
      .input("du", sql.Int, x.duracaoMinutos).input("b", sql.NVarChar(1000), x.correuBem).input("m", sql.NVarChar(1000), x.melhorar).input("por", sql.Int, ver.membroId)
      .query(`INSERT INTO SegurancaSimulados (CongregacaoId, Data, Tipo, Participantes, DuracaoMinutos, CorreuBem, Melhorar, RegistradoPorMembroId) VALUES (@c, @d, @t, @p, @du, @b, @m, @por);
              SELECT CAST(SCOPE_IDENTITY() AS INT) AS id`)).recordset[0].id;
    await t.commit();
  } catch (e) { await fecharTransacao(t, false); throw e; }
  await auditar("SegurancaSimulados", id, "SEGURANCA_SIMULADO", ver.membroId);
  return { sucesso: true, simuladoId: id, mensagem: "Simulado registrado." };
}

async function registrarVistoria(pool, { ver, congregacaoId, dados, hoje = hojeBrasilia() }) {
  const c = await congregacaoAlcancada(pool, ver, congregacaoId);
  if (!c) return NAO_EXISTE;
  const v = cs.validarVistoria(dados, { hoje });
  if (v.problema) return RECUSA(v.problema);
  const x = v.dados;
  const t = new sql.Transaction(pool);
  let id;
  try {
    await t.begin();
    if (!(await obterTrava(() => new sql.Request(t), `seguranca-vistoria-${congregacaoId}`, 8000))) { await fecharTransacao(t, false); return OCUPADO("Outra vistoria está sendo gravada. Tente de novo."); }
    const igual = contagem(await new sql.Request(t).input("c", sql.Int, congregacaoId).input("d", sql.Date, x.data)
      .query(`SELECT COUNT(*) AS n FROM SegurancaVistorias WHERE CongregacaoId = @c AND Data = @d AND AnuladoEm IS NULL`));
    if (igual) { await fecharTransacao(t, false); return RECUSA("Já há uma vistoria nesta data. Se o registro está errado, anule-o e registre de novo."); }
    id = (await new sql.Request(t).input("c", sql.Int, congregacaoId).input("d", sql.Date, x.data).input("o", sql.NVarChar(1000), x.observacoes).input("por", sql.Int, ver.membroId)
      .query(`INSERT INTO SegurancaVistorias (CongregacaoId, Data, Observacoes, RegistradoPorMembroId) VALUES (@c, @d, @o, @por); SELECT CAST(SCOPE_IDENTITY() AS INT) AS id`)).recordset[0].id;
    await new sql.Request(t).input("v", sql.Int, id).input("j", sql.NVarChar(sql.MAX), JSON.stringify(x.itens)).query(`
      INSERT INTO SegurancaVistoriaItens (VistoriaId, Item, Resultado, Pendencia)
      SELECT @v, j.item, j.resultado, j.pendencia FROM OPENJSON(@j) WITH (item NVARCHAR(30) '$.item', resultado NVARCHAR(14) '$.resultado', pendencia NVARCHAR(500) '$.pendencia') j`);
    await t.commit();
  } catch (e) { await fecharTransacao(t, false); throw e; }
  await auditar("SegurancaVistorias", id, "SEGURANCA_VISTORIA", ver.membroId);
  const pendentes = x.itens.filter((i) => i.resultado === "PENDENTE").length;
  return { sucesso: true, vistoriaId: id, mensagem: pendentes ? `Vistoria registrada, com ${pendentes} pendência(s) para resolver.` : "Vistoria registrada: tudo em ordem." };
}

// Anular (simulado ou vistoria registrados por engano): uma vez, com o motivo; o registro fica, riscado.
async function anular(pool, { ver, tipo, id, dados }) {
  const tabela = tipo === "SIMULADO" ? { nome: "SegurancaSimulados", chave: "SimuladoId", acao: "SEGURANCA_SIMULADO_ANULADO" } : { nome: "SegurancaVistorias", chave: "VistoriaId", acao: "SEGURANCA_VISTORIA_ANULADA" };
  const r0 = (await pool.request().input("id", sql.Int, id).query(`SELECT CongregacaoId, AnuladoEm FROM ${tabela.nome} WHERE ${tabela.chave} = @id`)).recordset[0];
  if (!r0 || !(await congregacaoAlcancada(pool, ver, r0.CongregacaoId))) return NAO_EXISTE;
  if (r0.AnuladoEm) return MUDOU("Este registro já foi anulado.");
  const v = cs.validarAnulacao(dados);
  if (v.problema) return RECUSA(v.problema);
  const r = await pool.request().input("id", sql.Int, id).input("por", sql.Int, ver.membroId).input("mo", sql.NVarChar(300), v.dados.motivo)
    .query(`UPDATE ${tabela.nome} SET AnuladoEm = SYSUTCDATETIME(), AnuladoPorMembroId = @por, MotivoAnulacao = @mo WHERE ${tabela.chave} = @id AND AnuladoEm IS NULL; SELECT @@ROWCOUNT AS n`);
  if (!contagem(r)) return MUDOU("Este registro já foi anulado.");
  await auditar(tabela.nome, id, tabela.acao, ver.membroId);
  return { sucesso: true, mensagem: "Registro anulado (fica no histórico, riscado)." };
}
async function resolverPendencia(pool, { ver, vistoriaItemId, dados }) {
  const i = (await pool.request().input("id", sql.Int, vistoriaItemId).query(`
    SELECT i.Resultado, i.ResolvidaEm, v.CongregacaoId, v.AnuladoEm FROM SegurancaVistoriaItens i JOIN SegurancaVistorias v ON v.VistoriaId = i.VistoriaId WHERE i.VistoriaItemId = @id`)).recordset[0];
  if (!i || !(await congregacaoAlcancada(pool, ver, i.CongregacaoId))) return NAO_EXISTE;
  if (i.Resultado !== "PENDENTE") return RECUSA("Este item não está pendente.");
  if (i.AnuladoEm) return RECUSA("Esta vistoria foi anulada.");
  if (i.ResolvidaEm) return MUDOU("Esta pendência já foi marcada como resolvida.");
  const v = cs.validarResolucao(dados);
  if (v.problema) return RECUSA(v.problema);
  const r = await pool.request().input("id", sql.Int, vistoriaItemId).input("por", sql.Int, ver.membroId).input("co", sql.NVarChar(500), v.dados.como)
    .query(`UPDATE SegurancaVistoriaItens SET ResolvidaEm = SYSUTCDATETIME(), ResolvidaPorMembroId = @por, ComoResolvida = @co WHERE VistoriaItemId = @id AND ResolvidaEm IS NULL; SELECT @@ROWCOUNT AS n`);
  if (!contagem(r)) return MUDOU("Esta pendência já foi marcada como resolvida.");
  await auditar("SegurancaVistoriaItens", vistoriaItemId, "SEGURANCA_PENDENCIA_RESOLVIDA", ver.membroId);
  return { sucesso: true, mensagem: "Pendência marcada como resolvida." };
}

// Membros adultos e ativos da congregação, para escolher quem entra na equipe (nome ou matrícula).
async function buscarMembros(pool, { ver, congregacaoId, q, hoje = hojeBrasilia() }) {
  const c = await congregacaoAlcancada(pool, ver, congregacaoId);
  if (!c) return null;
  const termo = typeof q === "string" ? q.trim().slice(0, 60) : "";
  if (termo.length < 2) return [];
  const rq = pool.request().input("c", sql.Int, congregacaoId).input("hoje", sql.Date, hoje);
  const porNumero = /^[0-9]{1,9}$/.test(termo);
  if (porNumero) rq.input("id", sql.Int, Number(termo)); else rq.input("q", sql.NVarChar(80), `%${termo.replace(/[[%_]/g, "[$&]")}%`);
  const r = await rq.query(`SELECT TOP 20 m.MembroId, m.Nome FROM MembroReferencia m WHERE m.CongregacaoId = @c AND m.Status = 'ATIVO' AND m.DataNascimento IS NOT NULL
    AND m.DataNascimento <= DATEADD(YEAR, -18, @hoje) AND NOT ${EXCLUIDO_SQL} AND ${porNumero ? "m.MembroId = @id" : "m.Nome LIKE @q"} ORDER BY m.Nome`);
  return r.recordset.map((m) => ({ membroId: m.MembroId, nome: m.Nome }));
}
async function adicionarEquipe(pool, { ver, congregacaoId, dados, hoje = hojeBrasilia() }) {
  const c = await congregacaoAlcancada(pool, ver, congregacaoId);
  if (!c) return NAO_EXISTE;
  const v = cs.validarEquipe(dados, { hoje });
  if (v.problema) return RECUSA(v.problema);
  const x = v.dados;
  const m = (await pool.request().input("m", sql.Int, x.membroId).input("hoje", sql.Date, hoje).query(`
    SELECT m.MembroId, m.Status, m.CongregacaoId, m.DataNascimento, CASE WHEN m.DataNascimento IS NOT NULL AND m.DataNascimento <= DATEADD(YEAR, -18, @hoje) THEN 1 ELSE 0 END AS Adulto,
      CASE WHEN ${EXCLUIDO_SQL} THEN 1 ELSE 0 END AS Excluido FROM MembroReferencia m WHERE m.MembroId = @m`)).recordset[0];
  if (!m || m.Status !== "ATIVO" || !mesmo(m.CongregacaoId, congregacaoId) || m.Excluido) return RECUSA("A pessoa precisa ser membro ativo desta congregação.");
  if (!Number(m.Adulto)) return RECUSA(m.DataNascimento ? "A equipe de segurança é só de adultos (18 anos ou mais)." : "A pessoa não tem data de nascimento no cadastro: a equipe é só de adultos. Peça à Secretaria para completar.");
  const t = new sql.Transaction(pool);
  let id;
  try {
    await t.begin();
    if (!(await obterTrava(() => new sql.Request(t), `seguranca-equipe-${congregacaoId}`, 8000))) { await fecharTransacao(t, false); return OCUPADO("A equipe está sendo alterada por outra pessoa. Tente de novo."); }
    const ja = contagem(await new sql.Request(t).input("c", sql.Int, congregacaoId).input("m", sql.Int, x.membroId).input("f", sql.NVarChar(20), x.funcao)
      .query(`SELECT COUNT(*) AS n FROM SegurancaEquipe WITH (UPDLOCK, HOLDLOCK) WHERE CongregacaoId = @c AND MembroId = @m AND Funcao = @f AND EncerradoEm IS NULL`));
    if (ja) { await fecharTransacao(t, false); return RECUSA("Esta pessoa já está na equipe com esta função."); }
    id = (await new sql.Request(t).input("c", sql.Int, congregacaoId).input("m", sql.Int, x.membroId).input("f", sql.NVarChar(20), x.funcao).input("de", sql.Date, x.desde)
      .input("ate", sql.Date, x.ate).input("por", sql.Int, ver.membroId)
      .query(`INSERT INTO SegurancaEquipe (CongregacaoId, MembroId, Funcao, Desde, Ate, RegistradoPorMembroId) VALUES (@c, @m, @f, @de, @ate, @por); SELECT CAST(SCOPE_IDENTITY() AS INT) AS id`)).recordset[0].id;
    await t.commit();
  } catch (e) { await fecharTransacao(t, false); throw e; }
  await auditar("SegurancaEquipe", id, "SEGURANCA_EQUIPE_ENTROU", ver.membroId);
  return { sucesso: true, equipeId: id, mensagem: "Pessoa incluída na equipe de segurança." };
}
async function encerrarEquipe(pool, { ver, equipeId, hoje = hojeBrasilia() }) {
  const e = (await pool.request().input("id", sql.Int, equipeId).query(`SELECT CongregacaoId, EncerradoEm, Desde, Ate FROM SegurancaEquipe WHERE EquipeId = @id`)).recordset[0];
  if (!e || !(await congregacaoAlcancada(pool, ver, e.CongregacaoId))) return NAO_EXISTE;
  if (e.EncerradoEm) return MUDOU("Esta pessoa já saiu da equipe.");
  // o "até" já passado não se estica até hoje (revisão independente, v7.15); quem ainda nem começou sai no dia em que começaria
  const ate = dia(e.Desde) > hoje ? dia(e.Desde) : e.Ate && dia(e.Ate) < hoje ? dia(e.Ate) : hoje;
  const r = await pool.request().input("id", sql.Int, equipeId).input("por", sql.Int, ver.membroId).input("ate", sql.Date, ate)
    .query(`UPDATE SegurancaEquipe SET EncerradoEm = SYSUTCDATETIME(), EncerradoPorMembroId = @por, MotivoEncerramento = 'MANUAL', Ate = @ate WHERE EquipeId = @id AND EncerradoEm IS NULL;
            SELECT @@ROWCOUNT AS n`);
  if (!contagem(r)) return MUDOU("Esta pessoa já saiu da equipe.");
  await auditar("SegurancaEquipe", equipeId, "SEGURANCA_EQUIPE_SAIU", ver.membroId);
  return { sucesso: true, mensagem: "Saída da equipe registrada (o histórico fica)." };
}

// ---------------------------------------------------------------
// Avisos do sininho (detectores do motor da vB.2, na rodada das 7h)
// ---------------------------------------------------------------

// Quem recebe: a permissão seguranca_congregacao no escopo da CONGREGAÇÃO ou da ÁREA dela (o nível geral acompanha pelo painel, sem um aviso por congregação).
// Revisão independente (v7.15): também quem recebeu o papel por DELEGAÇÃO vigente; nunca a concessão de departamento; nunca quem teve a exclusão LGPD atendida.
async function responsaveisDaSeguranca(pool) {
  return (await pool.request().input("perm", sql.NVarChar(60), `%,${cs.PERMISSAO_SEGURANCA},%`).query(`
    WITH alcance AS (
      SELECT l.EscopoTipo, l.EscopoId, l.MembroId FROM Lideranca l JOIN Papeis p ON p.PapelId = l.PapelId
      WHERE (',' + p.Permissoes + ',') LIKE @perm AND ${LIDERANCA_ATIVA_SQL} AND l.DepartamentoId IS NULL
      UNION
      SELECT l.EscopoTipo, l.EscopoId, g.DelegadoMembroId FROM DelegacoesAcesso g JOIN Lideranca l ON l.LiderancaId = g.LiderancaId JOIN Papeis p ON p.PapelId = l.PapelId
      WHERE (',' + p.Permissoes + ',') LIKE @perm AND l.DepartamentoId IS NULL AND g.Status = 'ATIVA' AND CAST(SYSUTCDATETIME() AS DATE) BETWEEN g.DataInicio AND g.DataFim)
    SELECT DISTINCT x.EscopoTipo, x.EscopoId, m.MembroId AS membroId, m.Nome AS nome, m.Email AS email FROM alcance x JOIN MembroReferencia m ON m.MembroId = x.MembroId
    WHERE m.Status = 'ATIVO' AND NOT ${EXCLUIDO_SQL} AND x.EscopoTipo IN ('CONGREGACAO', 'AREA') AND x.EscopoId IS NOT NULL`)).recordset;
}
async function detectar(pool, regra, { hoje = hojeBrasilia() } = {}) {
  const prazos = await lerPrazos(pool);
  const congs = await fatosDasCongregacoes(pool, null, hoje);
  const comAlerta = congs.filter((c) => avaliar(c, hoje, prazos).alertas.some((a) => a.regra === regra));
  if (!comAlerta.length) return [];
  const pessoas = await responsaveisDaSeguranca(pool);
  const porPessoa = new Map();
  for (const p of pessoas) {
    const alcance = comAlerta.filter((c) => (p.EscopoTipo === "CONGREGACAO" ? mesmo(c.CongregacaoId, p.EscopoId) : mesmo(c.AreaId, p.EscopoId)));
    if (!alcance.length) continue;
    if (!porPessoa.has(p.membroId)) porPessoa.set(p.membroId, { dest: { membroId: p.membroId, nome: p.nome, email: p.email }, congs: new Map() });
    for (const c of alcance) porPessoa.get(p.membroId).congs.set(c.CongregacaoId, c.Nome);
  }
  const mes = hoje.slice(0, 7);
  return [...porPessoa.values()].map((x) => ({ referenciaId: cs.referenciaDoResumo(regra, mes, [...x.congs.keys()]), fatoGerador: cs.textoResumo(regra, [...x.congs.values()]), destinatarios: [x.dest] }));
}

// ---------------------------------------------------------------
// Rotina diária, retenção e LGPD
// ---------------------------------------------------------------

// Quem deixou a congregação, foi desligado ou chegou ao "até" sai sozinho da equipe (o histórico fica).
async function encerrarEquipeAutomatica(pool, hoje = hojeBrasilia()) {
  return contagem(await pool.request().input("hoje", sql.Date, hoje).query(`
    UPDATE e SET EncerradoEm = SYSUTCDATETIME(),
      MotivoEncerramento = CASE WHEN m.MembroId IS NULL OR m.Status <> 'ATIVO' THEN 'DESLIGADO' WHEN m.CongregacaoId IS NULL OR m.CongregacaoId <> e.CongregacaoId THEN 'SAIU_DA_CONGREGACAO' ELSE 'PRAZO' END,
      Ate = CASE WHEN e.Ate IS NOT NULL AND e.Ate < @hoje THEN e.Ate WHEN e.Desde > @hoje THEN e.Desde ELSE @hoje END
    FROM SegurancaEquipe e LEFT JOIN MembroReferencia m ON m.MembroId = e.MembroId
    WHERE e.EncerradoEm IS NULL AND (m.MembroId IS NULL OR m.Status <> 'ATIVO' OR m.CongregacaoId IS NULL OR m.CongregacaoId <> e.CongregacaoId OR (e.Ate IS NOT NULL AND e.Ate < @hoje));
    SELECT @@ROWCOUNT AS n`));
}
async function aplicarRetencao(pool) {
  const diasImprensa = await diasDeRetencao(pool, "contatoImprensa");
  const diasEquipe = await diasDeRetencao(pool, "equipe");
  const contatos = contagem(await pool.request().input("d", sql.Int, diasImprensa).query(comMarca("crise_purga", `
    UPDATE CriseDemandasImprensa SET Contato = NULL, ContatoApagadoEm = SYSUTCDATETIME() WHERE Contato IS NOT NULL AND RecebidaEm < DATEADD(DAY, -@d, SYSUTCDATETIME());
    SET @apagadas = @@ROWCOUNT;`)));
  const equipe = contagem(await pool.request().input("d", sql.Int, diasEquipe).query(comMarca("seguranca_purga", `
    UPDATE SegurancaEquipe SET MembroId = NULL, AnonimizadoEm = SYSUTCDATETIME() WHERE MembroId IS NOT NULL AND EncerradoEm IS NOT NULL AND EncerradoEm < DATEADD(DAY, -@d, SYSUTCDATETIME());
    SET @apagadas = @@ROWCOUNT;`)));
  return { contatosApagados: contatos, equipeAnonimizada: equipe };
}
async function rotinaDiaria(pool, { hoje = hojeBrasilia() } = {}) {
  const r = { falhas: [] };
  try { r.equipeEncerrada = await encerrarEquipeAutomatica(pool, hoje); } catch (e) { r.falhas.push("equipe"); console.error("[SEGURANCA] equipe:", e.message); }
  try { r.retencao = await aplicarRetencao(pool); } catch (e) { r.falhas.push("retencao"); console.error("[CRISE] retenção:", e.message); }
  return r;
}

// Exclusão LGPD (dentro da transação de ExecutarExclusaoLGPD): a pessoa sai da equipe de segurança (o que estava aberto é encerrado) e o nome sai do registro. O histórico da
// crise (quem ordenou, o porta-voz, quem registrou manifestação ou pedido) é registro institucional da Igreja e fica (LGPD art. 7º, VI e IX; o ROPA diz isso).
async function exclusaoLgpd(r, membroId, hoje = hojeBrasilia()) {
  const equipe = await r().input("m", sql.Int, membroId).input("hoje", sql.Date, hoje).query(comMarca("seguranca_purga", `
    UPDATE SegurancaEquipe SET MembroId = NULL, AnonimizadoEm = SYSUTCDATETIME(),
      EncerradoEm = ISNULL(EncerradoEm, SYSUTCDATETIME()), MotivoEncerramento = ISNULL(MotivoEncerramento, 'EXCLUSAO_LGPD'),
      Ate = CASE WHEN EncerradoEm IS NOT NULL THEN Ate WHEN Desde > @hoje THEN Desde ELSE @hoje END
    WHERE MembroId = @m;
    SET @apagadas = @@ROWCOUNT;`));
  return { equipeSeguranca: contagem(equipe) };
}
// Meus Dados: a equipe de segurança (congregação, função, desde e até), as crises em que a pessoa foi o porta-voz e quantos registros dela existem na crise.
async function dadosDoTitular(pool, membroId) {
  const eq = (await pool.request().input("m", sql.Int, membroId).query(`
    SELECT e.Funcao, e.Desde, e.Ate, e.EncerradoEm, e.MotivoEncerramento, c.Nome AS Congregacao FROM SegurancaEquipe e LEFT JOIN Congregacoes c ON c.CongregacaoId = e.CongregacaoId
    WHERE e.MembroId = @m ORDER BY e.Desde DESC`)).recordset;
  const pv = (await pool.request().input("m", sql.Int, membroId).query(`
    SELECT DISTINCT h.CriseId, c.AbertaEm, c.EncerradaEm FROM CriseHistorico h JOIN CriseRegimes c ON c.CriseId = h.CriseId WHERE h.PortaVozMembroId = @m`)).recordset;
  const n = (await pool.request().input("m", sql.Int, membroId).query(`
    SELECT (SELECT COUNT(*) FROM CriseDemandasImprensa WHERE RegistradoPorMembroId = @m) AS demandas, (SELECT COUNT(*) FROM CriseManifestacoes WHERE RegistradoPorMembroId = @m) AS manifestacoes,
           (SELECT COUNT(*) FROM CriseDemandaRespostas WHERE RespondidoPorMembroId = @m) AS respostas`)).recordset[0] || {};
  return {
    equipeSeguranca: eq.map((e) => ({ congregacao: e.Congregacao || null, funcao: cs.FUNCOES_EQUIPE[e.Funcao] || e.Funcao, desde: dia(e.Desde), ate: dia(e.Ate), encerradoEm: iso(e.EncerradoEm), motivo: e.MotivoEncerramento || null })),
    portaVozEmCrises: pv.map((x) => ({ criseId: x.CriseId, abertaEm: iso(x.AbertaEm), encerradaEm: iso(x.EncerradaEm) })),
    registrosNaCrise: { pedidosDeImprensa: Number(n.demandas) || 0, manifestacoes: Number(n.manifestacoes) || 0, respostas: Number(n.respostas) || 0 }
  };
}

module.exports = {
  RETENCAO, MAX_DEMANDAS_DIA, faixa, limparCacheFaixa, presidenteAtual, liderancaAtiva, criseAtiva, carregarCrise,
  abrir, designarPortaVoz, encerrar, continuarAviso, listarCrises, detalheCrise, listarManifestacoes, registrarManifestacao,
  registrarDemanda, listarDemandas, responderDemanda,
  idsDoTerritorio, painelSeguranca, detalheSeguranca, salvarPlano, registrarSimulado, registrarVistoria, anular, resolverPendencia, buscarMembros, adicionarEquipe, encerrarEquipe,
  detectar, encerrarEquipeAutomatica, aplicarRetencao, rotinaDiaria, exclusaoLgpd, dadosDoTitular
};
