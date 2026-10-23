// e2e-37-trava7c-madrugada.js — Trava 7-C, achados D, E e F, com os handlers e o banco REAIS, sobre a base "cenario-trava7c" (`bash rodar.sh preparar-trava7c`):
//   BASE=cenario-trava7c bash rodar.sh roteiro e2e-37-trava7c-madrugada.js
//   D) a rodada da madrugada (processarFila com somenteSistema) manda SÓ o aviso de crise e nunca toca o comunicado comum, que espera a manhã; a contagem do aviso do sistema
//      (a que a marca do Storage guarda para a rota decidir se abre o banco) bate com a fila; a rodada do dia manda o resto.
//   E) o painel do nível geral do cuidado pastoral lista a região com congregação ativa e SEM Superintendente Regional ativo (a escada pula essa região); quem não é do nível
//      geral não recebe a lista.
//   F) a mensagem da crise e o detalhe do aviso dizem o teto de e-mails da crise lido da configuração (Catálogos → Prazos), não "100 por hora".
const L = require("./lib");
const { ok, fim, q, um, escalar, obterPool, API, path, GET, POST, GERAL, LIDER } = L;
// os canais de mentira ANTES de carregar os handlers (a comunicação guarda a referência na carga)
const enviados = [];
const emailMod = require(path.join(API, "shared/notificacaoEmail.js"));
emailMod.enviarEmailComunicado = async (m) => { enviados.push(m); return { ok: true }; };
emailMod.enviarEmailNotificacao = async () => true;
const pushMod = require(path.join(API, "shared/notificacaoPush.js"));
pushMod.enviarPushNotificacao = async () => 0;
const erroOriginal = console.error;
console.error = (...a) => { if (process.env.E2E_VERBOSO) erroOriginal(...a); };

const HCRISE = require(path.join(API, "GestaoCriseSeguranca/index.js"));
const HCUIDADO = require(path.join(API, "GestaoCuidadoPastoral/index.js"));
const com = require(path.join(API, "shared/comunicacaoDb.js"));
const SEC = GERAL(1002, ["crise_gestao", "seguranca_congregacao", "comunicacao", "cuidado_pastoral"]);

const situacoes = (envioId) => q("SELECT Canal, Situacao, COUNT(*) AS n FROM ComunicacaoEntregas WHERE EnvioId = @e AND Canal IN ('EMAIL', 'PUSH') GROUP BY Canal, Situacao", { e: envioId });
const pendentesDo = async (envioId) => escalar("SELECT COUNT(*) FROM ComunicacaoEntregas WHERE EnvioId = @e AND Canal IN ('EMAIL', 'PUSH') AND Situacao IN ('PENDENTE', 'ENVIANDO')", { e: envioId });

(async () => {
  const pool = await obterPool();
  await q("UPDATE Prazos SET Dias = 3 WHERE Sigla = 'COMUNICACAO_EMAILS_POR_RODADA'; UPDATE Prazos SET Dias = 500 WHERE Sigla = 'COMUNICACAO_EMAILS_POR_HORA'; UPDATE Prazos SET Dias = 77 WHERE Sigla = 'COMUNICACAO_CRISE_EMAILS_POR_HORA'");

  console.log("== D) um comunicado comum na fila (de antes da crise) ==");
  const membros = (await q("SELECT TOP 6 MembroId FROM MembroReferencia WHERE Status = 'ATIVO' AND Email IS NOT NULL ORDER BY MembroId")).map((x) => x.MembroId);
  const modelo = await escalar(`INSERT INTO ComunicacaoModelos (Chave, Versao, Categoria, Titulo, Corpo, Status, CriadoPorMembroId, AprovadoPorMembroId, AprovadoEm)
    VALUES (N'E2E_NOITE', 1, N'EVENTOS', N'Culto de jovens', N'Sábado tem culto de jovens, {nome}.', N'APROVADO', 1002, 1002, SYSUTCDATETIME()); SELECT CAST(SCOPE_IDENTITY() AS INT)`);
  const envioComum = await escalar(`INSERT INTO ComunicacaoEnvios (ModeloId, Categoria, CriteriosJson, GrupoDescricao, EnviadoPorMembroId, Total)
    VALUES (@m, N'EVENTOS', N'{}', N'Grupo E2E', 1002, @t); SELECT CAST(SCOPE_IDENTITY() AS INT)`, { m: modelo, t: membros.length });
  for (const m of membros) await q("INSERT INTO ComunicacaoEntregas (EnvioId, MembroId, Canal, Situacao) VALUES (@e, @m, 'EMAIL', 'PENDENTE'), (@e, @m, 'PUSH', 'PENDENTE')", { e: envioComum, m });
  const comuns = membros.length * 2;
  ok((await pendentesDo(envioComum)) === comuns, `o comunicado comum tem ${comuns} entregas na fila`);

  console.log("== a crise é aberta (o aviso a toda a liderança) ==");
  const PV = { tipo: "DESIGNADO", nome: "Assessora de Imprensa E2E", contato: "imprensa@ieadespa.e2e", ato: "Ato da Presidência nº 77/2026" };
  const ab = await POST(HCRISE, "abrir", SEC, { motivo: "Teste da madrugada", portaVoz: PV });
  ok(ab.status === 201 && ab.body.criseId > 0, "a crise abre (201)", ab.body);
  ok(/até 77 por hora para o aviso de crise/.test(ab.body.mensagem || "") && !/100 por hora/.test(ab.body.mensagem || ""), "F) a resposta diz o teto da crise lido da configuração (77), não '100 por hora'", ab.body.mensagem);
  ok(/use Comunicados/.test(ab.body.mensagem || "") && !/das 6h às 23h/.test(ab.body.mensagem || ""), "F) a resposta lembra os Comunicados para os membros e não diz mais que a fila só roda das 6h às 23h");
  const envioCrise = await escalar("SELECT EnvioId FROM CriseHistorico WHERE CriseId = @c AND Evento = 'ABERTA'", { c: ab.body.criseId });
  const det = await GET(HCRISE, "crise", SEC, { criseId: ab.body.criseId });
  const aviso = det.body && det.body.historico && det.body.historico[0] && det.body.historico[0].aviso;
  ok(aviso && aviso.emailsPorHora === 77, "F) o detalhe do aviso leva o teto lido da configuração (a tela mostra esse número)", aviso && aviso.emailsPorHora);
  const crisePend = await pendentesDo(envioCrise);
  ok(crisePend > 0, `ainda há aviso de crise na fila depois do ato (${crisePend})`);

  console.log("== D) a rodada da madrugada ==");
  // um comunicado comum que chega DEPOIS da abertura (celular e e-mail na fila): a madrugada também não pode tocá-lo
  const envioTarde = await escalar(`INSERT INTO ComunicacaoEnvios (ModeloId, Categoria, CriteriosJson, GrupoDescricao, EnviadoPorMembroId, Total)
    VALUES (@m, N'EVENTOS', N'{}', N'Grupo E2E tarde', 1002, @t); SELECT CAST(SCOPE_IDENTITY() AS INT)`, { m: modelo, t: membros.length });
  for (const m of membros) await q("INSERT INTO ComunicacaoEntregas (EnvioId, MembroId, Canal, Situacao) VALUES (@e, @m, 'EMAIL', 'PENDENTE'), (@e, @m, 'PUSH', 'PENDENTE')", { e: envioTarde, m });
  const tardeAntes = JSON.stringify(await situacoes(envioTarde));
  // (a abertura roda uma rodada curta da fila de DIA: o que ela já tirou do comunicado comum não conta; vale o que está na fila agora)
  const comumAntes = JSON.stringify(await situacoes(envioComum));
  const comunsNaFila = (await pendentesDo(envioComum)) + (await pendentesDo(envioTarde));
  ok(comunsNaFila > 0, `o comunicado comum ainda tem ${comunsNaFila} entrega(s) na fila quando a madrugada começa`);
  enviados.length = 0;
  let r = await com.processarFila(pool, { somenteSistema: true, orcamentoMs: 20000 });
  ok(r.pendentesSistema === (await pendentesDo(envioCrise)), "a contagem do aviso do sistema (a da marca) bate com a fila", { r: r.pendentesSistema });
  ok(r.pendentes === r.pendentesSistema + comunsNaFila, "a contagem total soma o comunicado comum", { total: r.pendentes, sistema: r.pendentesSistema });
  ok(JSON.stringify(await situacoes(envioComum)) === comumAntes && JSON.stringify(await situacoes(envioTarde)) === tardeAntes, "a rodada da madrugada não toca o comunicado comum (nem o celular nem o e-mail)");
  ok(enviados.length > 0 && enviados.every((m) => !/culto de jovens/i.test(`${m.assunto} ${m.texto}`)), `a madrugada manda só o aviso da crise (${enviados.length} e-mail(s))`);
  let voltas = 0;
  while (r.pendentesSistema > 0 && voltas++ < 60) r = await com.processarFila(pool, { somenteSistema: true, orcamentoMs: 20000 });
  ok(r.pendentesSistema === 0, `em ${voltas + 1} rodadas da madrugada o aviso da crise sai todo`, r.pendentesSistema);
  ok(JSON.stringify(await situacoes(envioComum)) === comumAntes && JSON.stringify(await situacoes(envioTarde)) === tardeAntes && (await pendentesDo(envioComum)) + (await pendentesDo(envioTarde)) === comunsNaFila, "e o comunicado comum continua inteiro na fila, esperando a manhã");
  ok(r.pendentes === comunsNaFila, "a marca ficaria com o comunicado comum pendente e zero do sistema (a rota da madrugada não abre mais o banco)", r.pendentes);

  console.log("== D) a rodada do dia ==");
  for (let i = 0; i < 10 && (await pendentesDo(envioComum)) + (await pendentesDo(envioTarde)) > 0; i++) await com.processarFila(pool, { orcamentoMs: 20000 });
  ok((await pendentesDo(envioComum)) + (await pendentesDo(envioTarde)) === 0, "de dia o comunicado comum sai (ou é barrado pelo consentimento): a fila esvazia");

  console.log("== E) a região sem Superintendente Regional ==");
  const semSup = async () => { const p = await GET(HCUIDADO, "painel", SEC); return (p.body && p.body.regioesSemSuperintendente) || null; };
  let lista = await semSup();
  ok(Array.isArray(lista) && !lista.some((x) => x.nome === "Região Norte E2E"), "a Região Norte (com Superintendente) não aparece", lista);
  const regiao = await escalar("INSERT INTO Regioes (Nome) VALUES (N'Região Sul E2E'); SELECT CAST(SCOPE_IDENTITY() AS INT)");
  const area = await escalar("INSERT INTO Areas (Nome, RegiaoId) VALUES (N'Área Sul E2E', @r); SELECT CAST(SCOPE_IDENTITY() AS INT)", { r: regiao });
  const cong = await escalar("INSERT INTO Congregacoes (Nome, AreaId) VALUES (N'Sul E2E', @a); SELECT CAST(SCOPE_IDENTITY() AS INT)", { a: area });
  await q("UPDATE Congregacoes SET Ativa = 1 WHERE CongregacaoId = @c", { c: cong });
  lista = await semSup();
  const sul = (lista || []).find((x) => x.regiaoId === regiao);
  ok(!!sul && sul.nome === "Região Sul E2E" && sul.congregacoes === 1, "a região nova, com congregação ativa e sem Superintendente, aparece para o nível geral", lista);
  const papelSup = await escalar("SELECT PapelId FROM Papeis WHERE Nome = N'Superintendente Regional'");
  await q("IF NOT EXISTS (SELECT 1 FROM MembroReferencia WHERE MembroId = 8090) INSERT INTO MembroReferencia (MembroId, Nome, CongregacaoId, Status, DataNascimento, Email, CargoMinisterial) VALUES (8090, N'Superintendente Sul E2E', @c, 'ATIVO', '1970-01-01', N'p8090@e2e.invalid', 'PASTOR')", { c: cong });
  const lid = await escalar("INSERT INTO Lideranca (MembroId, PapelId, EscopoTipo, EscopoId, SenhaHash) VALUES (8090, @p, 'REGIAO', @r, N'x'); SELECT CAST(SCOPE_IDENTITY() AS INT)", { p: papelSup, r: regiao });
  ok(!(await semSup()).some((x) => x.regiaoId === regiao), "cadastrado o Superintendente, a região sai da lista");
  await q("UPDATE Lideranca SET AtivoAte = DATEADD(DAY, -1, CAST(SYSUTCDATETIME() AS DATE)) WHERE LiderancaId = @l", { l: lid });
  ok((await semSup()).some((x) => x.regiaoId === regiao), "o mandato do Superintendente venceu: a região volta para a lista");
  ok((await semSup()).length > 0, "(há região na lista agora)");
  const dir = await GET(HCUIDADO, "painel", LIDER(3001, ["cuidado_pastoral"], ["Central E2E"]));
  ok(dir.status === 200 && Array.isArray(dir.body.regioesSemSuperintendente) && dir.body.regioesSemSuperintendente.length === 0, "o Dirigente não recebe a lista (é assunto do nível geral)", dir.status);
  await q("UPDATE Congregacoes SET Ativa = 0 WHERE CongregacaoId = @c", { c: cong });
  ok(!(await semSup()).some((x) => x.regiaoId === regiao), "região sem congregação ativa não aparece");
  fim("e2e-37 (Trava 7-C: a crise de madrugada, o Superintendente e o teto da crise)");
})().catch((e) => { console.log("ERRO:", e && e.stack); L.shimEncerrar(); process.exitCode = 1; });
