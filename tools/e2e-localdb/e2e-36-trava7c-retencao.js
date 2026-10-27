// e2e-36-trava7c-retencao.js — Trava 7-C, achado C: as retenções que estavam só "anotadas" desde a v7.2, v7.3 e v7.4, aplicadas pela rotina diária que já existe
// (NotificacoesAgendador, 7h), com o prazo lido da política (Proteção de Dados → Políticas de retenção). Sobre a base "cenario-trava7c" (cenario-crise + a 153 duas
// vezes: `bash rodar.sh preparar-trava7c`):
//   BASE=cenario-trava7c bash rodar.sh roteiro e2e-36-trava7c-retencao.js
// O que prova:
//   - Santa Ceia: a justificativa de ausência sai 2 anos depois da Ceia (fica "ausente justificada"); o prazo vem da política (mudar o número muda o corte; política
//     desativada volta ao padrão);
//   - canais: a ocorrência ENCERRADA (removida ou improcedente) perde descrição, link, observação e quem avisou em 5 anos — a aberta nunca; continua na lista, sem o nome;
//     o gatilho segura tudo fora da retenção (sem a marca, com a marca numa aberta, pôr o nome de volta); a marca é desligada; o administrador que saiu perde o nome
//     em 5 anos, o ativo nunca;
//   - eventos: o contato do convidado sai 1 ano depois do ÚLTIMO evento dele (o mesmo nome ou o mesmo contato num evento mais novo seguram);
//   - a rotina diária de verdade (com o segredo da rotina) roda as três e devolve o resumo; rodar de novo não muda nada.
const L = require("./lib");
const { ok, fim, q, um, escalar, obterPool, API, path } = L;
process.env.CRON_SECRET = process.env.CRON_SECRET || "segredo-da-rotina-e2e";
// os canais de mentira ANTES de carregar os handlers (a rotina diária manda avisos)
const emailMod = require(path.join(API, "shared/notificacaoEmail.js"));
emailMod.enviarEmailComunicado = async () => ({ ok: true });
emailMod.enviarEmailNotificacao = async () => true;
const pushMod = require(path.join(API, "shared/notificacaoPush.js"));
pushMod.enviarPushNotificacao = async () => 1;
const erroOriginal = console.error;
console.error = (...a) => { if (process.env.E2E_VERBOSO) erroOriginal(...a); };

const calDb = require(path.join(API, "shared/calendarioDb.js"));
const canaisDb = require(path.join(API, "shared/canaisDb.js"));
const eventosDb = require(path.join(API, "shared/eventosDb.js"));
const AGENDADOR = require(path.join(API, "NotificacoesAgendador/index.js"));
const hoje = L.hojeBr();
const somarDias = (iso, d) => { const [a, m, x] = iso.split("-").map(Number); return new Date(Date.UTC(a, m - 1, x + d)).toISOString().slice(0, 10); };
const falha = async (texto, params) => { try { await q(texto, params); return null; } catch (e) { return e.message || String(e); } };
const ATRAS = (dias) => new Date(Date.now() - dias * 86400000);

async function evento(titulo, dataIso, congregacaoId, tipoId) {
  const ano = Number(dataIso.slice(0, 4));
  await q(`IF NOT EXISTS (SELECT 1 FROM CalendarioAnos WHERE Ano = @a) INSERT INTO CalendarioAnos (Ano, PrazoPropostas) VALUES (@a, DATEFROMPARTS(@a, 1, 15))`, { a: ano });
  return escalar(`INSERT INTO CalendarioEventos (Ano, TipoId, Nivel, Titulo, DataInicio, DataFim, Abrangencia, CongregacaoId, Status)
    VALUES (@a, @t, 1, @titulo, @d, @d, 'CAMPO', NULL, 'HOMOLOGADO'); SELECT CAST(SCOPE_IDENTITY() AS INT)`, { a: ano, t: tipoId, titulo, d: dataIso });
}

(async () => {
  const pool = await obterPool();
  const tipoId = await escalar("SELECT TOP 1 TipoId FROM CalendarioTiposEvento ORDER BY TipoId");
  const congs = (await q("SELECT TOP 3 CongregacaoId FROM Congregacoes ORDER BY CongregacaoId")).map((r) => r.CongregacaoId);
  ok(tipoId && congs.length === 3, "o cenário tem tipo de evento e congregações");

  console.log("== Santa Ceia: a justificativa de ausência ==");
  const ceiaVelha = await evento("Santa Ceia Geral E2E (800 dias)", somarDias(hoje, -800), null, tipoId);
  const ceiaMedia = await evento("Santa Ceia Geral E2E (700 dias)", somarDias(hoje, -700), null, tipoId);
  await q(`INSERT INTO CalendarioPresencasDirigente (EventoId, CongregacaoId, Situacao, Justificativa, RegistradoPorMembroId) VALUES
    (@v, @c1, 'AUSENTE_JUSTIFICADA', N'Estava internado (cirurgia)', 1002), (@v, @c2, 'PRESENTE', NULL, 1002), (@m, @c1, 'AUSENTE_JUSTIFICADA', N'Viagem a trabalho', 1002)`,
  { v: ceiaVelha, m: ceiaMedia, c1: congs[0], c2: congs[1] });
  let r = await calDb.aplicarRetencao(pool, { hoje });
  ok(r.justificativasApagadas === 1 && r.retencaoDias === 730, "a rotina apaga só a justificativa da Ceia de mais de 2 anos (padrão 730 dias)", r);
  const velha = await um("SELECT Situacao, Justificativa, JustificativaApagadaEm FROM CalendarioPresencasDirigente WHERE EventoId = @e AND CongregacaoId = @c", { e: ceiaVelha, c: congs[0] });
  ok(velha.Justificativa === null && velha.JustificativaApagadaEm && velha.Situacao === "AUSENTE_JUSTIFICADA", "o texto sai e fica que a ausência foi justificada", velha);
  ok((await escalar("SELECT Justificativa FROM CalendarioPresencasDirigente WHERE EventoId = @e", { e: ceiaMedia })) === "Viagem a trabalho", "a Ceia de 700 dias guarda a justificativa");
  await q("UPDATE PoliticasRetencao SET DiasRetencao = 650 WHERE Categoria = N'Calendário — justificativa de ausência na Santa Ceia'");
  r = await calDb.aplicarRetencao(pool, { hoje });
  ok(r.justificativasApagadas === 1 && r.retencaoDias === 650, "o Encarregado encurta o prazo na tela (650 dias): a de 700 dias sai na rodada seguinte", r);
  await q("UPDATE PoliticasRetencao SET DiasRetencao = 650, Ativo = 0 WHERE Categoria = N'Calendário — justificativa de ausência na Santa Ceia'");
  ok((await calDb.aplicarRetencao(pool, { hoje })).retencaoDias === 730, "política desativada: vale o padrão de 2 anos");
  await q("UPDATE PoliticasRetencao SET DiasRetencao = 730, Ativo = 1 WHERE Categoria = N'Calendário — justificativa de ausência na Santa Ceia'");

  console.log("== Canais: ocorrências encerradas e administradores que saíram ==");
  const canalId = await escalar("SELECT TOP 1 CanalId FROM CanaisOficiaisComunicacao WHERE Sigla = N'INSTAGRAM_E2E'") || await escalar("SELECT TOP 1 CanalId FROM CanaisOficiaisComunicacao ORDER BY CanalId");
  const nova = async (st, diasAtras, extra = {}) => escalar(`INSERT INTO CanalOcorrencias (CanalId, Categoria, Descricao, LinkEvidencia, RelatadaPorMembroId, RelatadaEm, PrazoRemocaoEm, Status,
      RemovidaEm, RemocaoRegistradaEm, RemovidaPorMembroId, ProvaRemocao, DecididaPorMembroId, DecididaEm, MotivoImprocedente, AdvertenciaObs)
    VALUES (@c, 'DEBATE_POLITICO', N'Fulano de Tal postou propaganda do candidato X', N'https://exemplo.e2e/post', 8010, @rel, DATEADD(HOUR, 24, @rel), @st,
      @rem, @rem, CASE WHEN @st = 'REMOVIDA' THEN 1002 END, CASE WHEN @st = 'REMOVIDA' THEN N'print' END,
      CASE WHEN @st = 'IMPROCEDENTE' THEN 1002 END, CASE WHEN @st = 'IMPROCEDENTE' THEN @dec END, CASE WHEN @st = 'IMPROCEDENTE' THEN N'não era propaganda' END, N'advertido em particular');
    SELECT CAST(SCOPE_IDENTITY() AS INT)`, { c: canalId, st, rel: ATRAS(diasAtras + 1), rem: st === "REMOVIDA" ? ATRAS(diasAtras) : null, dec: ATRAS(diasAtras), ...extra });
  const o1 = await nova("IMPROCEDENTE", 1900), o2 = await nova("REMOVIDA", 1900), o3 = await nova("IMPROCEDENTE", 1000), o4 = await nova("ABERTA", 2000);
  // os administradores: um que saiu há mais de 5 anos, um que saiu há pouco e um ativo antigo
  const adm = async (membroId, designado, encerrado) => escalar(`INSERT INTO CanalAdministradores (CanalId, MembroId, Papel, DesignadoPorMembroId, DesignadoEm, EncerradoEm, EncerradoPorMembroId, MotivoEncerramento)
    VALUES (@c, @m, 'OPERADOR', 1002, @d, @e, CASE WHEN @e IS NULL THEN NULL ELSE 1002 END, CASE WHEN @e IS NULL THEN NULL ELSE N'mudou de cidade por doença na família' END); SELECT CAST(SCOPE_IDENTITY() AS INT)`,
  { c: canalId, m: membroId, d: designado, e: encerrado });
  const a1 = await adm(8011, ATRAS(2500), ATRAS(1900)), a2 = await adm(8012, ATRAS(400), ATRAS(100)), a3 = await adm(8030, ATRAS(3000), null);

  console.log("   o gatilho fora da retenção");
  ok(/imutável/.test(await falha("UPDATE CanalOcorrencias SET Descricao = N'outra' WHERE OcorrenciaId = @o", { o: o3 }) || ""), "sem a marca, a descrição não muda");
  ok(!!(await falha("UPDATE CanalOcorrencias SET RelatadaPorMembroId = NULL WHERE OcorrenciaId = @o", { o: o3 })), "sem a marca, quem avisou não sai (antes um NULL passava pela comparação do gatilho)");
  ok(!!(await falha(`EXEC sp_set_session_context @key = N'canais_purga', @value = 1;
    UPDATE CanalOcorrencias SET Descricao = N'x', RelatadaPorMembroId = NULL, AnonimizadaEm = SYSUTCDATETIME() WHERE OcorrenciaId = @o`, { o: o4 })), "com a marca, a ocorrência ABERTA não se anonimiza (CHECK)");
  await q("EXEC sp_set_session_context @key = N'canais_purga', @value = NULL");
  ok(!!(await falha("UPDATE CanalAdministradores SET MembroId = NULL, AnonimizadoEm = SYSUTCDATETIME() WHERE AdminId = @a", { a: a3 })), "o administrador ATIVO não perde o nome (CHECK)");

  r = await canaisDb.aplicarRetencao(pool);
  ok(r.ocorrenciasAnonimizadas === 2 && r.administradoresAnonimizados === 1, "a rotina anonimiza as 2 ocorrências encerradas há mais de 5 anos e o administrador que saiu há mais de 5", r);
  ok((await escalar("SELECT CAST(SESSION_CONTEXT(N'canais_purga') AS INT)")) === null, "a marca da retenção fica desligada depois");
  const an = await q("SELECT OcorrenciaId, Descricao, LinkEvidencia, AdvertenciaObs, RelatadaPorMembroId, AnonimizadaEm, Status, Categoria, RelatadaEm FROM CanalOcorrencias WHERE OcorrenciaId IN (@a, @b)", { a: o1, b: o2 });
  ok(an.length === 2 && an.every((x) => x.RelatadaPorMembroId === null && x.LinkEvidencia === null && x.AdvertenciaObs === null && !/Fulano/.test(x.Descricao) && x.AnonimizadaEm),
    "descrição, link, observação e quem avisou saem", an);
  ok(an.every((x) => x.Categoria === "DEBATE_POLITICO" && x.RelatadaEm && ["IMPROCEDENTE", "REMOVIDA"].includes(x.Status)), "ficam a categoria, as datas e o desfecho (a prova do relógio)");
  const fica = await q("SELECT OcorrenciaId, RelatadaPorMembroId, AnonimizadaEm FROM CanalOcorrencias WHERE OcorrenciaId IN (@a, @b)", { a: o3, b: o4 });
  ok(fica.every((x) => x.RelatadaPorMembroId === 8010 && x.AnonimizadaEm === null), "a encerrada há 1000 dias e a ABERTA há 2000 dias ficam como estão");
  const admins = await q("SELECT AdminId, MembroId, MotivoEncerramento, AnonimizadoEm, DesignadoPorMembroId, EncerradoEm FROM CanalAdministradores WHERE AdminId IN (@a, @b, @c) ORDER BY AdminId", { a: a1, b: a2, c: a3 });
  ok(admins[0].MembroId === null && admins[0].MotivoEncerramento === null && admins[0].AnonimizadoEm && admins[0].DesignadoPorMembroId === 1002 && admins[0].EncerradoEm,
    "o administrador que saiu há mais de 5 anos perde o nome e o motivo; ficam as datas e quem designou", admins[0]);
  ok(admins[1].MembroId === 8012 && admins[2].MembroId === 8030, "quem saiu há 100 dias e o ativo ficam");
  ok(!!(await falha(`EXEC sp_set_session_context @key = N'canais_purga', @value = 1;
    UPDATE CanalOcorrencias SET RelatadaPorMembroId = 8010 WHERE OcorrenciaId = @o`, { o: o1 })), "nem com a marca o nome volta para a ocorrência anonimizada");
  await q("EXEC sp_set_session_context @key = N'canais_purga', @value = NULL");
  const ctx = await canaisDb.carregarContexto(pool);
  const listadas = await canaisDb.carregarOcorrencias(pool, ctx, { canalId, verAutor: true });
  const l1 = listadas.find((x) => x.ocorrenciaId === o1);
  ok(!!l1 && l1.relatadaPorNome === null && l1.status === "IMPROCEDENTE", "a ocorrência anonimizada continua na lista do canal, sem o nome de quem avisou", l1 && { nome: l1.relatadaPorNome });
  ok(listadas.some((x) => x.ocorrenciaId === o3 && x.relatadaPorNome), "a não anonimizada mostra quem avisou");
  r = await canaisDb.aplicarRetencao(pool);
  ok(r.ocorrenciasAnonimizadas === 0 && r.administradoresAnonimizados === 0, "rodar de novo não muda nada", r);

  console.log("== Eventos: o contato do convidado externo ==");
  const eVelho = await evento("Congresso E2E (400 dias)", somarDias(hoje, -400), null, tipoId);
  const eRecente = await evento("Culto E2E (100 dias)", somarDias(hoje, -100), null, tipoId);
  const eFuturo = await evento("Seminário E2E (daqui a 30 dias)", somarDias(hoje, 30), null, tipoId);
  const conv = async (eventoId, nome, contato) => escalar(`INSERT INTO EventoConvidados (EventoId, Nome, Tipo, Contato, ReputacaoConhecida, CriadoPorMembroId)
    VALUES (@e, @n, 'PRELETOR', @c, 1, 1002); SELECT CAST(SCOPE_IDENTITY() AS INT)`, { e: eventoId, n: nome, c: contato });
  const c1 = await conv(eVelho, "Pr. Fulano E2E", "(94) 99999-0001");
  const c2 = await conv(eVelho, "Pr. Beltrano E2E", "(94) 99999-0002"); await conv(eRecente, "Pr. Beltrano E2E", null);
  const c3 = await conv(eVelho, "Cantor Ciclano E2E", "ciclano@e2e.org"); await conv(eFuturo, "Banda do Ciclano E2E", "ciclano@e2e.org");
  const c4 = await conv(eRecente, "Pra. Recente E2E", "(94) 99999-0004");
  r = await eventosDb.aplicarRetencao(pool, { hoje });
  ok(r.contatosApagados === 1 && r.retencaoDias === 365, "só o contato do convidado cujo último evento passou de 1 ano sai", r);
  const cs = Object.fromEntries((await q("SELECT ConvidadoId, Contato, ContatoApagadoEm, Nome FROM EventoConvidados WHERE ConvidadoId IN (@a, @b, @c, @d)", { a: c1, b: c2, c: c3, d: c4 })).map((x) => [x.ConvidadoId, x]));
  ok(cs[c1].Contato === null && cs[c1].ContatoApagadoEm && cs[c1].Nome === "Pr. Fulano E2E", "o contato sai e o nome fica (protocolo, Art. 111-A)");
  ok(cs[c2].Contato === "(94) 99999-0002", "o mesmo NOME num evento de 100 dias segura o contato antigo");
  ok(cs[c3].Contato === "ciclano@e2e.org", "o mesmo CONTATO num evento futuro segura o contato antigo");
  ok(cs[c4].Contato === "(94) 99999-0004", "o convidado de um evento recente guarda o contato");
  await q("UPDATE PoliticasRetencao SET DiasRetencao = 90 WHERE Categoria = N'Eventos — contato do convidado externo'");
  r = await eventosDb.aplicarRetencao(pool, { hoje });
  ok(r.retencaoDias === 90 && r.contatosApagados === 2, "com 90 dias na política, saem também o do Beltrano e o do recente (o Ciclano tem evento futuro)", r);
  await q("UPDATE PoliticasRetencao SET DiasRetencao = 365 WHERE Categoria = N'Eventos — contato do convidado externo'");

  console.log("== A rotina diária de verdade ==");
  const pAntes = await escalar("SELECT COUNT(*) FROM CalendarioPresencasDirigente WHERE Justificativa IS NOT NULL");
  await q(`INSERT INTO CalendarioPresencasDirigente (EventoId, CongregacaoId, Situacao, Justificativa, RegistradoPorMembroId) VALUES (@v, @c, 'AUSENTE_JUSTIFICADA', N'Doente', 1002)`, { v: ceiaVelha, c: congs[2] });
  const o5 = await nova("IMPROCEDENTE", 1900);
  const c5 = await conv(eVelho, "Pr. Rotina E2E", "(94) 99999-0005");
  const ctxR = { bindingData: {}, log: Object.assign(() => { }, { error() { }, info() { }, warn() { }, verbose() { } }) };
  await AGENDADOR(ctxR, { method: "POST", headers: { "x-cron-secret": process.env.CRON_SECRET }, query: {}, body: {} });
  const corpo = (ctxR.res && ctxR.res.body) || {};
  const ra = corpo.retencaoAnotadas || {};
  ok(ra.falhas && ra.falhas.length === 0, "a rotina diária roda as três retenções sem falha", ra.falhas);
  ok(ra.calendario && ra.calendario.justificativasApagadas === 1 && ra.canais && ra.canais.ocorrenciasAnonimizadas === 1 && ra.eventos && ra.eventos.contatosApagados === 1,
    "e devolve o resumo: 1 justificativa, 1 ocorrência e 1 contato", ra);
  ok((await escalar("SELECT COUNT(*) FROM CalendarioPresencasDirigente WHERE Justificativa IS NOT NULL")) === pAntes, "a justificativa velha nova também saiu pela rotina");
  ok((await escalar("SELECT RelatadaPorMembroId FROM CanalOcorrencias WHERE OcorrenciaId = @o", { o: o5 })) === null, "a ocorrência velha nova também foi anonimizada pela rotina");
  ok((await escalar("SELECT Contato FROM EventoConvidados WHERE ConvidadoId = @c", { c: c5 })) === null, "o contato velho novo também saiu pela rotina");
  fim("e2e-36 (Trava 7-C: retenções da v7.2, v7.3 e v7.4)");
})().catch((e) => { console.log("ERRO:", e && e.stack); L.shimEncerrar(); process.exitCode = 1; });
