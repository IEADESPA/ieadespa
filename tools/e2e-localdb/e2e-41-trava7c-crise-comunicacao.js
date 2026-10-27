// e2e-41-trava7c-crise-comunicacao.js — Trava de Revisão 7-C (costuras), a crise (v7.15) × a comunicação (v7.12) × a proteção, com o banco REAL, sobre a base "cenario-7c".
//   BAIXO 12: o menor conhecido na Liderança não recebe o aviso da crise.
//   BAIXO 13: quem foi SUSPENSO por medida cautelar depois do ato não recebe o que do aviso da crise estava na fila (e-mail e celular); quem saiu da liderança recebe o FIM.
//   MÉDIO 5:  o resumo do fim não vai a quem saiu SUSPENSO (vai a quem saiu da liderança sem medida).
//   MÉDIO 6:  a delegação só avisa (pedido da imprensa, segurança) com o cargo de quem delegou vigente e quem recebeu ainda na liderança; a medida cautelar cancela as delegações.
//   MÉDIO 7:  a equipe de segurança recusa quem tem pendência reservada ou está fora de comunhão (mensagem genérica) e a rotina tira com o motivo AFASTADO.
//   MÉDIO 8:  a exclusão LGPD passa a leitura do sininho para a entrega antes de apagar o aviso (a entrega da crise e da convocação é prova).
//   MÉDIO 9:  os contatos e responsáveis das versões SUBSTITUÍDAS do plano perdem o texto no prazo; a vigente nunca; o gatilho só aceita isso, com a marca.
//   BAIXO 15: Meus Dados leva TODOS os comunicados (a tela, 100) e os atos do titular no regime de crise.
//   BAIXO 16: o IP do consentimento de comunicação é anonimizado 5 anos depois que deixou de valer ou que a pessoa saiu; o vigente guarda; o gatilho só aceita isso.
const L = require("./lib");
const { ok, fim, q, um, escalar, obterPool, API, path, POST, GERAL, LIDER, hojeBr } = L;

const enviados = [], pushes = [];
const emailMod = require(path.join(API, "shared/notificacaoEmail.js"));
emailMod.enviarEmailComunicado = async (m) => { enviados.push(m); return { ok: true }; };
emailMod.enviarEmailNotificacao = async () => true;
const pushMod = require(path.join(API, "shared/notificacaoPush.js"));
pushMod.enviarPushNotificacao = async (_pool, _sql, membroId, msg) => { pushes.push({ membroId, ...msg }); return 1; };
let falhasAuditoria = 0;
const erroOriginal = console.error;
console.error = (...a) => { if (String(a[0]).includes("[AUDITORIA]")) falhasAuditoria++; if (process.env.E2E_VERBOSO) erroOriginal(...a); };

const db = require(path.join(API, "shared/criseSegurancaDb.js"));
const com = require(path.join(API, "shared/comunicacaoDb.js"));
const MEDIDAS = require(path.join(API, "GestaoMedidasCautelares/index.js"));
const EXCLUSAO = require(path.join(API, "ExecutarExclusaoLGPD/index.js"));
const VER_CRISE = { membroId: 1002, crise: true, seguranca: true, geralSeguranca: true, podeVerCongregacao: () => true };
const VER_DIR = { membroId: 3001, crise: false, seguranca: true, geralSeguranca: false, podeVerCongregacao: (n) => n === "Central E2E" };
const P = { ana: 8010, bento: 8011, carla: 8012, davi: 8013, menor: 8021 };
const deps = { enviarEmail: async (m) => { enviados.push(m); return { ok: true }; }, enviarPush: async (membroId, msg) => { pushes.push({ membroId, ...msg }); return 1; } };
const falha = async (texto, params) => { try { await q(texto, params); return null; } catch (e) { return e.message || String(e); } };
const somarDias = (iso, d) => { const [a, m, x] = iso.split("-").map(Number); return new Date(Date.UTC(a, m - 1, x + d)).toISOString().slice(0, 10); };
const suspender = async (m) => {
  await q("INSERT INTO MedidasCautelares (MembroId, Motivo, SuspenderAcessoSistema, SuspensaoContasBancarias, SuspensaoChavesFisicas, AplicadoPor) VALUES (@m, N'teste', 1, 0, 0, 1001)", { m });
  await q("UPDATE Lideranca SET AtivoAte = DATEADD(DAY, -1, CAST(SYSUTCDATETIME() AS DATE)) WHERE MembroId = @m", { m });
};
const situacao = (envio, membro, canal) => escalar("SELECT Situacao FROM ComunicacaoEntregas WHERE EnvioId = @e AND MembroId = @m AND Canal = @c", { e: envio, m: membro, c: canal });

(async () => {
  const pool = await obterPool();
  const hoje = hojeBr();
  const cong = {};
  for (const [k, n] of [["c", "Central E2E"], ["v", "Vila Nova E2E"], ["b", "Beta E2E"]]) cong[k] = await escalar("SELECT CongregacaoId FROM Congregacoes WHERE Nome = @n", { n });
  const papelDir = await escalar("SELECT PapelId FROM Papeis WHERE Nome = N'Dirigente de Congregação'");

  console.log("== BAIXO 12: o menor na Liderança não recebe o aviso da crise ==");
  await q("INSERT INTO Lideranca (MembroId, PapelId, EscopoTipo, EscopoId) VALUES (@m, @p, 'CONGREGACAO', @c)", { m: P.menor, p: papelDir, c: cong.c });
  const ab = await db.abrir(pool, { ver: VER_CRISE, dados: { motivo: "Boato na imprensa", portaVoz: { tipo: "PRESIDENTE", contato: "(91) 3333-4444" } }, deps });
  ok(ab.sucesso, "a crise abre", ab.mensagem);
  const criseId = ab.criseId;
  const envAb = await escalar("SELECT EnvioId FROM CriseHistorico WHERE CriseId = @c AND Evento = 'ABERTA'", { c: criseId });
  ok((await escalar("SELECT COUNT(*) FROM ComunicacaoEntregas WHERE EnvioId = @e AND MembroId = @m", { e: envAb, m: P.menor })) === 0, "o menor conhecido não está entre os avisados");
  ok((await escalar("SELECT COUNT(*) FROM ComunicacaoEntregas WHERE EnvioId = @e AND MembroId = 3001", { e: envAb })) > 0, "os adultos da liderança estão (controle)");
  await q("DELETE FROM Lideranca WHERE MembroId = @m", { m: P.menor });

  console.log("== BAIXO 13: o suspenso depois do ato não recebe o que estava na fila ==");
  // um aviso da crise gravado do mesmo jeito que o ato grava (sininho na hora; celular e e-mail na fila), SEM a primeira rodada: assim a suspensão entra entre o ato e a fila
  const pessoas13 = await q("SELECT m.MembroId, m.Nome, c.Nome AS Congregacao FROM MembroReferencia m LEFT JOIN Congregacoes c ON c.CongregacaoId = m.CongregacaoId WHERE m.MembroId IN (3002, 3003)");
  const preparo = await com.prepararAvisoDoSistema(pool, { categoria: "CRISE", titulo: "Aviso de teste 7-C", corpo: "Paz do Senhor, {{primeiro_nome}}: aviso de teste.", pessoas: pessoas13,
    celular: { titulo: "Crise (teste)", mensagem: "Aviso de teste." } });
  const env13 = await com.gravarAvisoDoSistema(() => pool.request(), preparo, { chave: "crise-teste-7c", enviadoPor: 1002, grupo: "teste 7-C" });
  ok((await situacao(env13, 3002, "EMAIL")) === "PENDENTE", "o e-mail do aviso espera na fila", await situacao(env13, 3002, "EMAIL"));
  await suspender(3002);
  await com.celularDoSistema(pool, { deps, orcamentoMs: 15000 });
  for (let i = 0; i < 6; i++) await com.processarFila(pool, { deps: { ...deps, celularDoSistema: false }, orcamentoMs: 20000 });
  ok((await situacao(env13, 3002, "EMAIL")) === "CANCELADO", "o e-mail do suspenso fica CANCELADO", await situacao(env13, 3002, "EMAIL"));
  ok(["CANCELADO", "SEM_APARELHO"].includes(await situacao(env13, 3002, "PUSH")) && !pushes.some((x) => x.membroId === 3002 && x.titulo === "Crise (teste)"), "e o celular dele não recebe",
    await situacao(env13, 3002, "PUSH"));
  ok(!["CANCELADO", "PENDENTE", "ENVIANDO"].includes(await situacao(env13, 3003, "EMAIL")), "quem continua na liderança recebe (controle)", [await situacao(env13, 3003, "PUSH"), await situacao(env13, 3003, "EMAIL")]);

  console.log("== MÉDIO 6: delegação e aviso ==");
  const lidPres = await escalar("SELECT TOP 1 l.LiderancaId FROM Lideranca l JOIN Papeis p ON p.PapelId = l.PapelId WHERE l.MembroId = 1001 AND p.Nome = N'Presidente'");
  const lidSec = await escalar("SELECT TOP 1 l.LiderancaId FROM Lideranca l JOIN Papeis p ON p.PapelId = l.PapelId WHERE l.MembroId = 1002 AND p.Nome = N'Secretário Geral'");
  const papelSec = await escalar("SELECT PapelId FROM Papeis WHERE Nome = N'Secretário Geral'");
  const lidVelha = (await q("INSERT INTO Lideranca (MembroId, PapelId, EscopoTipo, EscopoId, AtivoAte) VALUES (2011, @p, 'GLOBAL', NULL, DATEADD(DAY, -10, CAST(SYSUTCDATETIME() AS DATE))); SELECT CAST(SCOPE_IDENTITY() AS INT) AS id", { p: papelSec }))[0].id;
  const delegar = (lid, de, para) => q("INSERT INTO DelegacoesAcesso (LiderancaId, DeleganteMembroId, DelegadoMembroId, DataInicio, DataFim) VALUES (@l, @de, @pa, DATEADD(DAY, -1, CAST(SYSUTCDATETIME() AS DATE)), DATEADD(DAY, 10, CAST(SYSUTCDATETIME() AS DATE)))", { l: lid, de, pa: para });
  await delegar(lidPres, 1001, 3001);           // válida
  await delegar(lidSec, 1002, 3003);            // o delegado vai ser suspenso
  await delegar(lidVelha, 2011, 3004);          // o cargo de quem delegou já acabou
  await suspender(3003);
  const dem = await db.registrarDemanda(pool, { ver: { membroId: 8001, crise: false }, dados: { veiculo: "Jornal E2E", contato: "(91) 9 0000-0000", pedido: "Quer uma nota sobre o boato." }, deps });
  ok(dem.sucesso, "um líder registra o pedido da imprensa", dem.mensagem);
  const avisados = (await q("SELECT DestinatarioMembroId AS m FROM Notificacoes WHERE RegraChave = 'CRISE_DEMANDA_IMPRENSA' AND ReferenciaId = @d", { d: dem.demandaId })).map((x) => x.m);
  ok(avisados.includes(3001), "a delegação válida avisa o delegado (controle)", avisados);
  ok(!avisados.includes(3003), "o delegado SUSPENSO por medida cautelar não recebe o pedido da imprensa", avisados);
  ok(!avisados.includes(3004), "a delegação de um cargo que já acabou não avisa", avisados);
  // a medida cautelar pela rota cancela as delegações que a pessoa recebeu ou deu
  const lidDir = await escalar("SELECT TOP 1 LiderancaId FROM Lideranca WHERE MembroId = 3001");
  await delegar(lidDir, 3001, 3004);
  const ctxM = { bindingData: {}, log: Object.assign(() => { }, { error() { } }) };
  await MEDIDAS(ctxM, { method: "POST", query: {}, headers: { "x-auth-token": GERAL(1002, ["pessoas", "permissoes"]) }, body: { membroId: 3001, motivo: "medida de teste", suspenderAcessoSistema: true } });
  ok(ctxM.res && ctxM.res.status === 201, "a medida cautelar com suspensão de acesso é aplicada", ctxM.res && ctxM.res.body);
  ok((await escalar("SELECT COUNT(*) FROM DelegacoesAcesso WHERE (DelegadoMembroId = 3001 OR DeleganteMembroId = 3001) AND Status = 'ATIVA'")) === 0, "as delegações recebidas e dadas pelo suspenso ficam canceladas");
  ok((await escalar("SELECT COUNT(*) FROM DelegacoesAcesso WHERE DelegadoMembroId = 3001 AND Status = 'CANCELADA'")) === 1, "(a que ele recebeu do Presidente, inclusive)");

  console.log("== MÉDIO 5: o fim da crise não vai a quem saiu suspenso ==");
  await q("UPDATE Lideranca SET AtivoAte = DATEADD(DAY, -1, CAST(SYSUTCDATETIME() AS DATE)) WHERE MembroId = 3004");   // saiu da liderança sem medida
  const enc = await db.encerrar(pool, { ver: VER_CRISE, criseId, dados: { resumo: "Boato desmentido." }, deps });
  ok(enc.sucesso, "a crise encerra", enc.mensagem);
  const envFim = await escalar("SELECT EnvioId FROM CriseHistorico WHERE CriseId = @c AND Evento = 'ENCERRADA'", { c: criseId });
  const doFim = (await q("SELECT DISTINCT MembroId AS m FROM ComunicacaoEntregas WHERE EnvioId = @e", { e: envFim })).map((x) => x.m);
  ok(!doFim.includes(3002) && !doFim.includes(3003) && !doFim.includes(3001), "o resumo do fim não vai a quem saiu SUSPENSO (3001, 3002, 3003)", doFim);
  ok(doFim.includes(3004), "vai a quem saiu da liderança sem medida (controle)", doFim);
  ok(/"incluiQuemSaiu":true/.test(await escalar("SELECT CriteriosJson FROM ComunicacaoEnvios WHERE EnvioId = @e", { e: envFim })), "o envio do fim leva a marca de quem saiu");
  await com.celularDoSistema(pool, { deps, orcamentoMs: 15000 });
  ok(["ACEITO", "SEM_APARELHO"].includes(await situacao(envFim, 3004, "PUSH")), "e a fila entrega o fim a quem saiu sem medida (não cancela)", await situacao(envFim, 3004, "PUSH"));

  console.log("== MÉDIO 7: a equipe de segurança ==");
  const EQ = { funcao: "BRIGADA", desde: hoje };
  await q("INSERT INTO MinisterioMenoresAutoDenuncias (MembroId, Tipo, DataCiencia) VALUES (@m, 'INQUERITO_POLICIAL', @d)", { m: P.bento, d: hoje });
  let r = await db.adicionarEquipe(pool, { ver: VER_CRISE, congregacaoId: cong.c, dados: { ...EQ, membroId: P.bento } });
  ok(!r.sucesso && r.mensagem === "A pessoa precisa ser membro ativo desta congregação.", "quem tem pendência reservada não entra (a mesma resposta de quem não é daqui)", r);
  await q("UPDATE MembroReferencia SET SituacaoMembro = 'SEM_COMUNHAO' WHERE MembroId = @m", { m: P.carla });
  r = await db.adicionarEquipe(pool, { ver: VER_CRISE, congregacaoId: cong.c, dados: { ...EQ, membroId: P.carla } });
  ok(!r.sucesso && r.mensagem === "A pessoa precisa ser membro ativo desta congregação.", "quem está fora de comunhão não entra", r);
  r = await db.adicionarEquipe(pool, { ver: VER_CRISE, congregacaoId: cong.c, dados: { ...EQ, membroId: P.ana } });
  ok(r.sucesso, "a Ana (sem pendência) entra (controle)", r);
  const eqAna = r.equipeId;
  // a Carla entrou antes de ficar fora de comunhão (gravado direto) e a Ana passa a ter pendência
  const eqCarla = (await q("INSERT INTO SegurancaEquipe (CongregacaoId, MembroId, Funcao, Desde, RegistradoPorMembroId) VALUES (@c, @m, 'PORTARIA', @d, 1002); SELECT CAST(SCOPE_IDENTITY() AS INT) AS id", { c: cong.c, m: P.carla, d: hoje }))[0].id;
  await q("INSERT INTO MinisterioMenoresAutoDenuncias (MembroId, Tipo, DataCiencia) VALUES (@m, 'INQUERITO_POLICIAL', @d)", { m: P.ana, d: hoje });
  const rot = await db.rotinaDiaria(pool, { hoje });
  ok(rot.falhas.length === 0, "a rotina roda inteira", rot);
  const motivos = await q("SELECT EquipeId, MotivoEncerramento AS m, EncerradoEm FROM SegurancaEquipe WHERE EquipeId IN (@a, @b)", { a: eqAna, b: eqCarla });
  ok(motivos.length === 2 && motivos.every((x) => x.m === "AFASTADO" && x.EncerradoEm), "a rotina tira da equipe quem passou a ter pendência e quem ficou fora de comunhão, com o motivo AFASTADO", motivos);
  ok(!!(await falha("INSERT INTO SegurancaEquipe (CongregacaoId, MembroId, Funcao, Desde, RegistradoPorMembroId, EncerradoEm, MotivoEncerramento, Ate) VALUES (@c, 8011, 'BRIGADA', @d, 1002, SYSUTCDATETIME(), N'QUALQUER', @d)", { c: cong.c, d: hoje })),
    "o CHECK do motivo continua fechado para o que não é da lista");

  console.log("== MÉDIO 9: os contatos das versões antigas do plano ==");
  const insPlano = async (versao, revisado) => (await q(`INSERT INTO SegurancaPlanos (CongregacaoId, Versao, RotasEvacuacao, PontosEncontro, ContatosLocais, Responsaveis, RegistradoPorMembroId, RevisadoEm)
    VALUES (@c, @v, N'Porta principal e porta lateral.', N'Praça em frente.', N'Diác. João (91) 9999-0000', N'Diác. João e Irmã Maria', 1002, @r); SELECT CAST(SCOPE_IDENTITY() AS INT) AS id`, { c: cong.b, v: versao, r: revisado }))[0].id;
  const v1 = await insPlano(1, new Date(Date.UTC(2019, 0, 10))), v2 = await insPlano(2, new Date(Date.UTC(2020, 5, 1))), v3 = await insPlano(3, new Date());
  ok(!!(await falha("UPDATE SegurancaPlanos SET ContatosLocais = NULL, Responsaveis = N'(anonimizado)', AnonimizadoEm = SYSUTCDATETIME() WHERE PlanoId = @p", { p: v1 })), "sem a marca, o gatilho não deixa apagar nem a versão antiga");
  ok(!!(await falha(`EXEC sp_set_session_context @key = N'seguranca_purga', @value = 1; UPDATE SegurancaPlanos SET ContatosLocais = NULL, Responsaveis = N'(anonimizado)', AnonimizadoEm = SYSUTCDATETIME() WHERE PlanoId = @p`, { p: v3 })),
    "com a marca, a versão VIGENTE não muda");
  await q("EXEC sp_set_session_context @key = N'seguranca_purga', @value = NULL");
  ok(!!(await falha(`EXEC sp_set_session_context @key = N'seguranca_purga', @value = 1; UPDATE SegurancaPlanos SET RotasEvacuacao = N'outra rota qualquer', ContatosLocais = NULL, Responsaveis = N'(anonimizado)', AnonimizadoEm = SYSUTCDATETIME() WHERE PlanoId = @p`, { p: v1 })),
    "com a marca, nada além dos contatos e responsáveis muda");
  await q("EXEC sp_set_session_context @key = N'seguranca_purga', @value = NULL");
  ok(!!(await falha("DELETE FROM SegurancaPlanos WHERE PlanoId = @p", { p: v1 })), "a versão não se apaga");
  const ret = await db.aplicarRetencao(pool);
  ok(ret.planosAnonimizados === 1, "a retenção apaga os contatos da versão substituída há mais de 5 anos (só a v1)", ret);
  const planos = await q("SELECT PlanoId, ContatosLocais, Responsaveis, AnonimizadoEm, RotasEvacuacao FROM SegurancaPlanos WHERE CongregacaoId = @c ORDER BY Versao", { c: cong.b });
  ok(planos[0].ContatosLocais === null && planos[0].Responsaveis === "(anonimizado)" && planos[0].AnonimizadoEm && planos[0].RotasEvacuacao === "Porta principal e porta lateral.", "v1: contatos e responsáveis saíram; as rotas ficaram", planos[0]);
  ok(planos[1].ContatosLocais && !planos[1].AnonimizadoEm && planos[2].ContatosLocais && !planos[2].AnonimizadoEm, "v2 (substituída há menos de 5 anos) e v3 (vigente) intactas");
  ok((await escalar("SELECT CAST(SESSION_CONTEXT(N'seguranca_purga') AS INT)")) === null, "a marca não ficou ligada");
  ok((await db.aplicarRetencao(pool)).planosAnonimizados === 0, "rodar de novo não mexe em nada");
  ok((await escalar("SELECT DiasRetencao FROM PoliticasRetencao WHERE Categoria = N'Plano de emergência — contatos das versões antigas'")) === 1825, "a política é ajustável (PoliticasRetencao, 5 anos)");
  void v2;

  console.log("== BAIXO 16: o IP do consentimento de comunicação ==");
  const insK = async (m, concedido, origem, ip, criado) => (await q(`INSERT INTO ComunicacaoConsentimentos (MembroId, Canal, Categoria, Concedido, Origem, TextoVersao, TextoHash, EnderecoIp, CriadoEm)
    VALUES (@m, 'EMAIL', 'DEVOCIONAL', @k, @o, N'v1', REPLICATE('a', 64), @ip, @cr); SELECT CAST(SCOPE_IDENTITY() AS INT) AS id`, { m, k: concedido, o: origem, ip, cr: criado }))[0].id;
  const velho = new Date(Date.now() - 6 * 365 * 86400000), quaseVelho = new Date(Date.now() - 5.5 * 365 * 86400000), recente = new Date(Date.now() - 30 * 86400000);
  const kA = await insK(P.davi, true, "MEU_PAINEL", "200.1.1.1", velho), kB = await insK(P.davi, false, "MEU_PAINEL", "200.1.1.2", quaseVelho);
  const kC = await insK(P.davi, true, "MEU_PAINEL", "200.1.1.3", recente);
  const kD = await insK(2009, true, "MEU_PAINEL", "200.1.1.4", velho);       // 2009: desligado no cenário
  await q("UPDATE MembroReferencia SET Status = 'DESLIGADO', DataSaida = DATEADD(YEAR, -6, CAST(SYSUTCDATETIME() AS DATE)) WHERE MembroId = 2009");
  ok(!!(await falha("UPDATE ComunicacaoConsentimentos SET EnderecoIp = N'anonimizado' WHERE ConsentimentoId = @k", { k: kA })), "sem a marca, o gatilho não deixa mudar o IP");
  ok(!!(await falha(`EXEC sp_set_session_context @key = N'comunicacao_purga', @value = 1; UPDATE ComunicacaoConsentimentos SET EnderecoIp = N'anonimizado', Concedido = 0 WHERE ConsentimentoId = @k`, { k: kA })),
    "com a marca, nada além do IP muda");
  await q("EXEC sp_set_session_context @key = N'comunicacao_purga', @value = NULL");
  const ips = await com.anonimizarIpsVencidos(pool);
  const depois = await q("SELECT ConsentimentoId AS k, EnderecoIp AS ip FROM ComunicacaoConsentimentos WHERE ConsentimentoId IN (@a, @b, @c, @d) ORDER BY ConsentimentoId", { a: kA, b: kB, c: kC, d: kD });
  const ipDe = (k) => (depois.find((x) => x.k === k) || {}).ip;
  ok(ipDe(kA) === "anonimizado", "o consentimento substituído há mais de 5 anos perde o IP", depois);
  ok(ipDe(kB) === "200.1.1.2", "o substituído há menos de 5 anos guarda", depois);
  ok(ipDe(kC) === "200.1.1.3", "o vigente guarda (é a prova do sim)", depois);
  ok(ipDe(kD) === "anonimizado", "quem saiu do rol há mais de 5 anos perde o IP", depois);
  ok(ips.anonimizados >= 2, "a contagem volta", ips);
  ok((await escalar("SELECT CAST(SESSION_CONTEXT(N'comunicacao_purga') AS INT)")) === null, "a marca não ficou ligada");
  const rotCom = await com.rotinaDiaria(pool);
  ok(rotCom.falhas.length === 0 && rotCom.ips, "a rotina diária da comunicação inclui o IP", rotCom);

  console.log("== BAIXO 15: Meus Dados sem corte e com os atos da crise ==");
  const modelo = await escalar("SELECT TOP 1 ModeloId FROM ComunicacaoModelos WHERE Status = 'APROVADO' AND Categoria = 'CRISE'");
  await q(`DECLARE @i INT = 0; WHILE @i < 105 BEGIN
      INSERT INTO ComunicacaoEnvios (ModeloId, Categoria, CriteriosJson, GrupoDescricao, EnviadoPorMembroId, Total) VALUES (@mo, 'CRISE', N'{}', N'teste', 1002, 1);
      INSERT INTO ComunicacaoEntregas (EnvioId, MembroId, Canal, Situacao) VALUES (SCOPE_IDENTITY(), @m, 'SININHO', 'ACEITO'); SET @i = @i + 1; END`, { mo: modelo, m: P.davi });
  ok((await com.meusComunicados(pool, P.davi)).length === 100, "a tela mostra os 100 mais novos");
  const dados = await com.dadosDoTitular(pool, P.davi);
  ok(dados.comunicados.length >= 105 && dados.comunicadosRecebidos >= 105, "a exportação de Meus Dados leva todos", dados.comunicadosRecebidos);
  const dc = await db.dadosDoTitular(pool, 1002);
  ok(dc.registrosNaCrise.atosDoRegime === 2 && dc.atosNoRegimeDeCrise.map((x) => x.ato).join("|") === "Abriu o regime de crise|Encerrou o regime de crise", "os atos do titular no regime de crise aparecem", dc.atosNoRegimeDeCrise);

  console.log("== MÉDIO 8: a exclusão LGPD passa a leitura para a entrega antes de apagar o aviso ==");
  await q("UPDATE Notificacoes SET Lida = 1, LidaEm = SYSUTCDATETIME() WHERE RegraChave = 'COMUNICADO' AND ReferenciaId = @e AND DestinatarioMembroId = 3003", { e: envAb });
  ok((await escalar("SELECT COUNT(*) FROM ComunicacaoEntregas WHERE EnvioId = @e AND MembroId = 3003 AND Canal = 'SININHO' AND LidaEm IS NULL", { e: envAb })) === 1, "antes: a entrega ainda não tem a leitura");
  const sol = (await q("INSERT INTO SolicitacoesTitularLGPD (MembroId, Tipo, Status) VALUES (3003, 'EXCLUSAO', 'PENDENTE'); SELECT CAST(SCOPE_IDENTITY() AS INT) AS id"))[0].id;
  const ctxEx = { bindingData: { id: String(sol) }, log: Object.assign(() => { }, { error() { } }) };
  await EXCLUSAO(ctxEx, { method: "POST", query: {}, body: {}, headers: { "x-auth-token": GERAL(1002, ["protecaodedados"]) } });
  ok(ctxEx.res.status === 200 && ctxEx.res.body.sucesso, "a exclusão LGPD executa", ctxEx.res.body);
  ok((await escalar("SELECT COUNT(*) FROM Notificacoes WHERE RegraChave = 'COMUNICADO' AND DestinatarioMembroId = 3003")) === 0, "o aviso do sininho saiu");
  ok((await escalar("SELECT COUNT(*) FROM ComunicacaoEntregas WHERE EnvioId = @e AND MembroId = 3003 AND Canal = 'SININHO' AND LidaEm IS NOT NULL", { e: envAb })) === 1,
    "a entrega da crise (prova) ficou com a leitura");

  ok(falhasAuditoria === 0, "nenhuma falha de auditoria", falhasAuditoria);
  fim("e2e-41 (Trava 7-C: crise, comunicação e proteção)");
})().catch((e) => { console.log("ERRO:", e && e.stack); L.shimEncerrar(); process.exitCode = 1; });
