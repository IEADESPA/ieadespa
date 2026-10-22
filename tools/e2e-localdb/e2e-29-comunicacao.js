// e2e-29-comunicacao.js — v7.12 (Comunicação), com os handlers e o banco REAIS, sobre a base "cenario-pastoral" + a migração 150.
// O esquema (consentimento e entrega que não se reescrevem, modelo aprovado que não se edita), o consentimento por canal e categoria com a impressão digital do texto, a ficha em
// papel, os modelos (só o nível geral), o grupo vivo cortado pelo território (sem menor, sem quem pediu exclusão), o envio (sininho na hora; celular e e-mail pela fila com a
// cota da rodada e da hora; 429 que devolve à fila; consentimento retirado no meio; cancelamento; o mesmo envio em 10 minutos), a convocação (sem consentimento, sem link de
// saída, ciência, quem não foi alcançado), o link de saída sem login, Meus comunicados, a retenção e a exclusão LGPD.
const L = require("./lib");
const { ok, fim, q, um, escalar, obterPool, API, path, GET, POST, LIDER, GERAL, PIN, IP_PUBLICO, chamar } = L;
const H = require(path.join(API, "GestaoComunicacao/index.js"));
const SAIR = require(path.join(API, "ComunicacaoSair/index.js"));
const FILA = require(path.join(API, "ComunicacaoFila/index.js"));
const db = require(path.join(API, "shared/comunicacaoDb.js"));
const cm = require(path.join(API, "shared/comunicacao.js"));
const SEGREDO = require(path.join(API, "shared/segredoSessao.js")).resolverSegredo();
process.env.CRON_SECRET = "segredo-da-rotina-e2e";

const C = "Central E2E", V = "Vila Nova E2E";
const PERM = ["comunicacao"];
const DIR_C = LIDER(3001, PERM, [C]), SEC = GERAL(1002, PERM), DIR_SEM = LIDER(3001, ["pessoas"], [C]);
const VER = { geral: { membroId: 1002, gestao: true, geral: true, podeVerCongregacao: () => true }, dirC: { membroId: 3001, gestao: true, geral: false, podeVerCongregacao: (n) => n === C } };
const P = { ana: 8010, bento: 8011, carla: 8012, davi: 8013, elisa: 8014, menor: 8021, vilaA: 8030, beta: 8040 };
const falha = async (texto, params) => { try { await q(texto, params); return null; } catch (e) { return e.message || String(e); } };
const log = Object.assign(() => { }, { error() { }, info() { }, warn() { }, verbose() { } });
async function sair(metodo, t) { const ctx = { bindingData: {}, log }; await SAIR(ctx, { method: metodo, query: metodo === "GET" ? { t } : {}, body: metodo === "POST" ? { t } : {}, headers: IP_PUBLICO }); return ctx.res; }
// os canais de mentira: o e-mail anota o que "saiu"; o celular responde 1 aparelho
const enviados = [];
let respostaEmail = () => ({ ok: true });
const deps = { enviarEmail: async (m) => { const r = respostaEmail(m); if (r.ok) enviados.push(m); return r; }, enviarPush: async () => 1, orcamentoMs: 8000 };

(async () => {
  const pool = await obterPool();
  const c1 = await escalar("SELECT CongregacaoId FROM Congregacoes WHERE Nome = @n", { n: C });
  const c2 = await escalar("SELECT CongregacaoId FROM Congregacoes WHERE Nome = @n", { n: V });
  await q("UPDATE Prazos SET Dias = 3 WHERE Sigla = 'COMUNICACAO_EMAILS_POR_RODADA'; UPDATE Prazos SET Dias = 4 WHERE Sigla = 'COMUNICACAO_EMAILS_POR_HORA'");
  await q("DELETE FROM PushInscricoesMembro WHERE MembroId IN (8010, 8011, 8012)");
  await q(`INSERT INTO PushInscricoesMembro (MembroId, Endpoint, P256dh, Auth) VALUES (8010, N'https://push.e2e/ana', N'p', N'a'), (8011, N'https://push.e2e/bento', N'p', N'a')`);
  await q("UPDATE MembroReferencia SET Email = NULL WHERE MembroId = @m", { m: P.davi });

  console.log("== o esquema da 150 ==");
  ok((await escalar("SELECT COUNT(*) FROM Funcionalidades WHERE Chave = 'comunicacao'")) === 1, "a permissão comunicacao existe");
  ok((await escalar("SELECT COUNT(*) FROM NotificacaoRegras WHERE Chave = 'COMUNICADO' AND Obrigatoria = 1")) === 1, "a regra do sininho COMUNICADO existe e é obrigatória");
  ok(!!(await falha("INSERT INTO ComunicacaoConsentimentos (MembroId, Canal, Categoria, Concedido, Origem, TextoVersao, TextoHash) VALUES (8010, 'EMAIL', 'EVENTOS', 1, 'LINK_SAIR', 'v', REPLICATE('a', 64))")),
    "o link de saída nunca grava um \"sim\"");
  ok(!!(await falha("INSERT INTO ComunicacaoConsentimentos (MembroId, Canal, Categoria, Concedido, Origem, TextoVersao, TextoHash) VALUES (8010, 'EMAIL', 'CONVOCACAO', 1, 'MEU_PAINEL', 'v', REPLICATE('a', 64))")),
    "a convocação não tem consentimento (é obrigação)");
  ok(!!(await falha("INSERT INTO ComunicacaoConsentimentos (MembroId, Canal, Categoria, Concedido, Origem, TextoVersao, TextoHash) VALUES (8010, 'EMAIL', 'EVENTOS', 1, 'FICHA_PAPEL', 'v', REPLICATE('a', 64))")),
    "a ficha em papel exige a data e quem lançou");

  console.log("== o consentimento em Meu Painel ==");
  const pref0 = (await GET(H, "preferencias", PIN(P.ana))).body;
  const ev = pref0.categorias.find((c) => c.categoria === "EVENTOS");
  ok(pref0.categorias.length === 4 && ev.canais.EMAIL.concedido === false && ev.hash === cm.hashDoTexto("EVENTOS") && ev.texto.length > 100, "começa sem nenhum \"sim\" (pedido, não presumido), com o texto e a impressão digital");
  ok(pref0.categorias.find((c) => c.categoria === "CONVOCACAO").canais.EMAIL.obrigatoria === true && pref0.aparelhos === 1, "a convocação aparece como obrigatória; a Ana tem 1 aparelho");
  const errado = await chamar(H, { acao: "preferencias", metodo: "POST", token: PIN(P.ana), corpo: { mudancas: [{ canal: "EMAIL", categoria: "EVENTOS", concedido: true, hash: "0".repeat(64) }] }, headers: IP_PUBLICO });
  ok(errado.status === 422 && errado.body.textoMudou === true, "o \"sim\" com a impressão digital de outro texto é recusado (texto mudou)");
  const marcou = async (membroId, lista) => (await chamar(H, { acao: "preferencias", metodo: "POST", token: PIN(membroId), corpo: { mudancas: lista.map(([canal, categoria, concedido]) => ({ canal, categoria, concedido, hash: cm.hashDoTexto(categoria) })) }, headers: IP_PUBLICO }));
  const r1 = await marcou(P.ana, [["EMAIL", "EVENTOS", true], ["PUSH", "EVENTOS", true]]);
  ok(r1.status === 200 && r1.body.gravadas === 2, "a Ana autoriza e-mail e celular para eventos", r1.body);
  const linha = await um("SELECT TOP 1 * FROM ComunicacaoConsentimentos WHERE MembroId = 8010 ORDER BY ConsentimentoId DESC");
  ok(linha.Origem === "MEU_PAINEL" && linha.TextoHash === cm.hashDoTexto("EVENTOS") && linha.TextoVersao === cm.TEXTO_VERSAO && linha.EnderecoIp === "177.8.9.10", "guarda a origem, a versão, a impressão digital e o endereço de quem marcou", linha);
  ok((await marcou(P.ana, [["EMAIL", "EVENTOS", true]])).body.gravadas === 0, "marcar de novo o que já está marcado não cria linha");
  ok((await marcou(P.bento, [["EMAIL", "EVENTOS", false]])).body.gravadas === 0, "\"não\" sem nenhum \"sim\" antes também não");
  await marcou(P.bento, [["EMAIL", "EVENTOS", true], ["PUSH", "EVENTOS", true]]);
  await marcou(P.carla, [["EMAIL", "EVENTOS", true]]);
  await marcou(P.davi, [["EMAIL", "EVENTOS", true]]);                 // sem e-mail no cadastro
  await marcou(P.elisa, [["EMAIL", "EVENTOS", true]]);
  await marcou(P.vilaA, [["EMAIL", "EVENTOS", true]]);
  await marcou(P.menor, [["EMAIL", "EVENTOS", true]]);
  ok(!!(await falha("UPDATE ComunicacaoConsentimentos SET Concedido = 0 WHERE MembroId = 8010")) && !!(await falha("DELETE FROM ComunicacaoConsentimentos WHERE MembroId = 8010")), "o histórico não se edita nem se apaga");
  ok((await marcou(P.ana, [["WHATSAPP", "EVENTOS", true]])).status === 422 && (await marcou(P.ana, [["EMAIL", "CONVOCACAO", true]])).status === 422, "WhatsApp e convocação não se marcam");

  console.log("== a ficha em papel ==");
  ok((await POST(H, "ficha", DIR_SEM, { membroId: P.carla, canal: "PUSH", categoria: "DEVOCIONAL", concedido: true, dataFicha: "2026-10-01" })).status === 403, "sem a permissão: 403");
  const ficha = await POST(H, "ficha", DIR_C, { membroId: P.carla, canal: "PUSH", categoria: "DEVOCIONAL", concedido: true, dataFicha: "2026-10-01" });
  ok(ficha.status === 201 && (await um("SELECT TOP 1 * FROM ComunicacaoConsentimentos WHERE MembroId = 8012 ORDER BY ConsentimentoId DESC")).RegistradoPorMembroId === 3001, "o Dirigente lança a ficha da Carla (Central), com a data e quem lançou");
  ok((await POST(H, "ficha", DIR_C, { membroId: P.vilaA, canal: "PUSH", categoria: "DEVOCIONAL", concedido: true, dataFicha: "2026-10-01" })).status === 404, "a de quem é de outra congregação: 404 (como se não existisse)");
  ok((await POST(H, "ficha", DIR_C, { membroId: P.carla, canal: "PUSH", categoria: "DEVOCIONAL", concedido: true, dataFicha: "2099-01-01" })).status === 422, "ficha com data futura: recusada");
  ok((await POST(H, "ficha", DIR_C, { membroId: 3001, canal: "PUSH", categoria: "DEVOCIONAL", concedido: true, dataFicha: "2026-10-01" })).status === 422, "a própria ficha não: cada um marca o seu em Meu Painel");

  console.log("== os modelos ==");
  ok((await POST(H, "modelo", DIR_C, { categoria: "EVENTOS", titulo: "Congresso", corpo: "Olá {{primeiro_nome}}, venha ao congresso." })).status === 403, "o Dirigente não escreve modelo (é a voz da Igreja: nível geral)");
  const rasc = await POST(H, "modelo", SEC, { categoria: "EVENTOS", titulo: "Congresso de jovens", corpo: "Olá, {{ primeiro_nome }}! O congresso da {{congregacao}} é sábado." });
  ok(rasc.status === 201 && rasc.body.modelo.status === "RASCUNHO" && rasc.body.modelo.versao === 1 && rasc.body.modelo.corpo.includes("{{primeiro_nome}}"), "o nível geral escreve um rascunho", rasc.body);
  const mEv = rasc.body.modelo.modeloId;
  ok((await POST(H, "enviar", SEC, { modeloId: mEv, criterios: {} })).status === 422, "rascunho não se envia");
  const ed = await POST(H, "modelo", SEC, { chave: rasc.body.modelo.chave, categoria: "EVENTOS", titulo: "Congresso de jovens 2026", corpo: "Olá, {{primeiro_nome}}! O congresso da {{congregacao}} é sábado, às 19h." });
  ok(ed.body.modelo.modeloId === mEv && ed.body.modelo.versao === 1, "editar com o rascunho aberto edita o próprio rascunho");
  ok((await POST(H, "aprovar-modelo", SEC, { modeloId: mEv })).body.modelo.status === "APROVADO", "aprovado");
  ok(!!(await falha("UPDATE ComunicacaoModelos SET Corpo = N'outro texto qualquer' WHERE ModeloId = @m", { m: mEv })) && !!(await falha("DELETE FROM ComunicacaoModelos WHERE ModeloId = @m", { m: mEv })), "o aprovado não se edita nem se apaga (gatilho)");
  const v2 = await POST(H, "modelo", SEC, { chave: rasc.body.modelo.chave, categoria: "EVENTOS", titulo: "Congresso de jovens 2026", corpo: "Olá, {{primeiro_nome}}! Mudou: o congresso é domingo." });
  ok(v2.body.modelo.versao === 2 && v2.body.modelo.status === "RASCUNHO", "corrigir o aprovado = versão 2 em rascunho");
  await POST(H, "aprovar-modelo", SEC, { modeloId: v2.body.modelo.modeloId });
  ok((await um("SELECT Status FROM ComunicacaoModelos WHERE ModeloId = @m", { m: mEv })).Status === "ARQUIVADO", "aprovar a versão 2 arquiva a 1");
  const mEv2 = v2.body.modelo.modeloId;
  ok((await GET(H, "modelos", DIR_C)).body.modelos.every((m) => m.status === "APROVADO" && m.categoria !== "CONVOCACAO"), "o Dirigente só vê os aprovados que pode usar");
  const conv = (await POST(H, "modelo", SEC, { categoria: "CONVOCACAO", titulo: "Convocação da Assembleia Geral", corpo: "Fica convocado(a), {{primeiro_nome}}, para a Assembleia Geral Ordinária." })).body.modelo.modeloId;
  await POST(H, "aprovar-modelo", SEC, { modeloId: conv });

  console.log("== o grupo vivo ==");
  const prevC = await POST(H, "previa", DIR_C, { categoria: "EVENTOS", criterios: {} });
  const naCentral = await escalar(`SELECT COUNT(*) FROM MembroReferencia m WHERE m.CongregacaoId = @c AND m.Status = 'ATIVO' AND (m.DataNascimento IS NULL OR m.DataNascimento <= DATEADD(YEAR, -18, CAST(SYSUTCDATETIME() AS DATE)))`, { c: c1 });
  ok(prevC.status === 200 && prevC.body.total === naCentral, `"todas" para o Dirigente da Central = só a Central (${naCentral}), sem o menor`, prevC.body);
  ok(prevC.body.canais.EMAIL.receberao === 4 && prevC.body.canais.PUSH.receberao === 2, "e-mail: Ana, Bento, Carla e Elisa (o Davi não tem e-mail; o menino não entra); celular: Ana e Bento", prevC.body.canais);
  ok((await POST(H, "previa", DIR_C, { categoria: "EVENTOS", criterios: { territorio: { tipo: "CONGREGACAO", ids: [c2] } } })).body.total === 0, "pedir a Vila Nova (fora do território) dá zero: o grupo é cortado");
  ok((await POST(H, "previa", SEC, { categoria: "EVENTOS", criterios: { territorio: { tipo: "CONGREGACAO", ids: [c2] } } })).body.total >= 2, "o nível geral alcança a Vila Nova");
  ok((await POST(H, "previa", DIR_C, { categoria: "CONVOCACAO", criterios: {} })).status === 403, "a convocação: só o nível geral");
  ok((await POST(H, "previa", SEC, { categoria: "EVENTOS", criterios: { cargos: ["PRESBITERO"] } })).body.total === 1, "por cargo: o presbítero");
  ok((await POST(H, "previa", SEC, { categoria: "EVENTOS", criterios: { dizimistasInativosDias: 90 } })).status === 422, "não existe grupo por dízimo");
  const grp = await POST(H, "grupo", DIR_C, { nome: "Central — todos", criterios: {} });
  ok(grp.status === 201 && (await GET(H, "grupos", DIR_C)).body.grupos.some((g) => g.audienciaId === grp.body.audienciaId), "o grupo fica guardado com nome");

  console.log("== o envio e a fila ==");
  ok((await POST(H, "enviar", DIR_C, { modeloId: conv, criterios: {} })).status === 403, "o Dirigente não envia convocação");
  const env = await db.enviar(pool, { ver: VER.dirC, dados: { modeloId: mEv2, criterios: {} }, deps });
  ok(env.sucesso && env.envio.total === naCentral, "o Dirigente envia o comunicado à Central", env.envio);
  const envioId = env.envioId;
  ok((await escalar("SELECT COUNT(*) FROM Notificacoes WHERE RegraChave = 'COMUNICADO' AND ReferenciaId = @e", { e: envioId })) === naCentral, "o sininho de todos nasceu na hora");
  const msgAna = await um("SELECT Titulo, Mensagem FROM Notificacoes WHERE RegraChave = 'COMUNICADO' AND ReferenciaId = @e AND DestinatarioMembroId = 8010", { e: envioId });
  ok(/^Olá, Ana! Mudou/.test(msgAna.Mensagem), "personalizado com o primeiro nome", msgAna);
  const sit = async (canal) => Object.fromEntries((await q("SELECT Situacao, COUNT(*) AS n FROM ComunicacaoEntregas WHERE EnvioId = @e AND Canal = @c GROUP BY Situacao", { e: envioId, c: canal })).map((l) => [l.Situacao, l.n]));
  ok((await sit("PUSH")).ACEITO === 2, "o celular saiu na primeira rodada (Ana e Bento)", await sit("PUSH"));
  ok(enviados.length === 3 && (await sit("EMAIL")).ACEITO === 3 && (await sit("EMAIL")).PENDENTE === 1, "o e-mail: 3 na primeira rodada (a cota da rodada), 1 na fila", await sit("EMAIL"));
  ok((await sit("EMAIL")).SEM_CONTATO === 1 && (await sit("EMAIL")).SEM_CONSENTIMENTO > 0, "o Davi fica \"sem e-mail\" e quem não autorizou, \"sem consentimento\"");
  ok(enviados.every((m) => /sair\.html\?t=/.test(m.html) && /Não quero mais receber/.test(m.html)), "todo e-mail de eventos leva o link de saída");
  const dup = await db.enviar(pool, { ver: VER.dirC, dados: { modeloId: mEv2, criterios: {} }, deps });
  ok(dup.repetido === true && dup.envioId === envioId, "o mesmo envio em 10 minutos é o mesmo (duplo clique)");
  const segunda = await db.processarFila(pool, { deps });
  ok(segunda.email.cota === 1 && segunda.email.aceitos === 1, "segunda rodada: a cota da HORA (4) deixa só mais 1", segunda.email);
  ok((await um("SELECT Status FROM ComunicacaoEnvios WHERE EnvioId = @e", { e: envioId })).Status === "CONCLUIDO", "sem nada na fila, o envio é concluído");
  ok(!!(await falha("UPDATE ComunicacaoEntregas SET Situacao = 'PENDENTE' WHERE EnvioId = @e AND Situacao = 'ACEITO'", { e: envioId })) && !!(await falha("DELETE FROM ComunicacaoEntregas WHERE EnvioId = @e", { e: envioId })), "a entrega não volta atrás nem se apaga");

  console.log("== 429, consentimento retirado no meio e cancelamento ==");
  await q("UPDATE Prazos SET Dias = 50 WHERE Sigla IN ('COMUNICACAO_EMAILS_POR_RODADA', 'COMUNICACAO_EMAILS_POR_HORA')");
  respostaEmail = () => ({ limite: true });
  const env2 = await db.enviar(pool, { ver: VER.geral, dados: { modeloId: mEv2, criterios: { territorio: { tipo: "CONGREGACAO", ids: [c1, c2] } } }, deps });
  const e2 = env2.envioId;
  ok((await escalar("SELECT COUNT(*) FROM ComunicacaoEntregas WHERE EnvioId = @e AND Canal = 'EMAIL' AND Situacao = 'PENDENTE'", { e: e2 })) === 5, "o serviço disse \"excesso\": os 5 e-mails voltam para a fila (nada saiu)");
  respostaEmail = () => ({ ok: true });
  await marcou(P.ana, [["EMAIL", "EVENTOS", false]]);
  const r3 = await db.processarFila(pool, { deps });
  const anaE2 = await um("SELECT Situacao FROM ComunicacaoEntregas WHERE EnvioId = @e AND MembroId = 8010 AND Canal = 'EMAIL'", { e: e2 });
  ok(anaE2.Situacao === "SEM_CONSENTIMENTO" && r3.email.aceitos === 4, "a Ana desmarcou antes da rodada: o e-mail dela não sai; os outros 4 saem", { anaE2, r3: r3.email });
  const env3 = await db.enviar(pool, { ver: VER.geral, dados: { modeloId: mEv2, criterios: { territorio: { tipo: "CONGREGACAO", ids: [c2] } } }, deps: { ...deps, enviarEmail: async () => ({ limite: true }) } });
  ok((await POST(H, "cancelar", DIR_C, { envioId: env3.envioId })).status === 404, "o Dirigente não cancela envio de outro");
  const canc = await POST(H, "cancelar", SEC, { envioId: env3.envioId });
  ok(canc.status === 200 && (await escalar("SELECT COUNT(*) FROM ComunicacaoEntregas WHERE EnvioId = @e AND Situacao = 'PENDENTE'", { e: env3.envioId })) === 0, "cancelado: nada fica na fila", canc.body);

  console.log("== a convocação oficial ==");
  enviados.length = 0;
  const ec = await db.enviar(pool, { ver: VER.geral, dados: { modeloId: conv, criterios: { territorio: { tipo: "CONGREGACAO", ids: [c1] } } }, deps });
  ok(ec.sucesso && ec.envio.categoria === "CONVOCACAO", "o nível geral convoca a Central");
  const ecs = Object.fromEntries((await q("SELECT Situacao, COUNT(*) AS n FROM ComunicacaoEntregas WHERE EnvioId = @e AND Canal = 'EMAIL' GROUP BY Situacao", { e: ec.envioId })).map((l) => [l.Situacao, l.n]));
  ok(!ecs.SEM_CONSENTIMENTO && ecs.SEM_CONTATO === 1, "a convocação vai a todos que têm e-mail, com ou sem consentimento (o Davi fica sem contato)", ecs);
  ok(enviados.length > 0 && enviados.every((m) => !/sair\.html/.test(m.html) && /obrigação do Estatuto/.test(m.texto)), "e o e-mail da convocação não tem link de saída e diz por quê");
  const ci = await POST(H, "ciencia", PIN(P.ana), { envioId: ec.envioId });
  ok(ci.status === 200 && (await um("SELECT CienciaEm FROM ComunicacaoEntregas WHERE EnvioId = @e AND MembroId = 8010 AND Canal = 'SININHO'", { e: ec.envioId })).CienciaEm, "a Ana toca \"Recebi a convocação\": a ciência fica registrada");
  ok((await POST(H, "ciencia", PIN(P.ana), { envioId: envioId })).status === 422, "comunicado de eventos não pede ciência");
  ok((await POST(H, "ciencia", PIN(P.vilaA), { envioId: ec.envioId })).status === 404, "quem não recebeu não dá ciência");
  const rel = (await GET(H, "envio", SEC, { envioId: ec.envioId })).body;
  ok(rel.ciencia === 1 && Array.isArray(rel.naoAlcancados) && rel.naoAlcancados.some((p) => p.membroId === P.davi && "telefone" in p) && !rel.naoAlcancados.some((p) => p.membroId === P.ana),
    "o relatório da convocação lista quem não foi alcançado (o Davi, sem e-mail nem aparelho), com o telefone para o nível geral", rel.naoAlcancados && rel.naoAlcancados.length);
  ok((await GET(H, "envio", DIR_C, { envioId: ec.envioId })).status === 404, "o relatório de envio de outro: 404");
  ok((await GET(H, "envio", DIR_C, { envioId })).body.canais.EMAIL.ACEITO === 4, "o Dirigente vê o relatório do próprio envio");

  console.log("== o link de saída (sem login) ==");
  const env4 = await db.enviar(pool, { ver: VER.dirC, dados: { modeloId: mEv2, criterios: { cargos: ["MEMBRO"] } }, deps });
  const tokenBento = cm.assinarSaida(SEGREDO, { membroId: P.bento, categoria: "EVENTOS", envioId: env4.envioId });
  const g = await sair("GET", tokenBento);
  ok(g.status === 200 && g.body.valido && g.body.jaSaiu === false && g.body.rotulo === "Eventos", "abrir o link só lê (não descadastra)", g.body);
  ok((await escalar("SELECT TOP 1 CAST(Concedido AS INT) FROM ComunicacaoConsentimentos WHERE MembroId = 8011 AND Canal = 'EMAIL' AND Categoria = 'EVENTOS' ORDER BY ConsentimentoId DESC")) === 1, "o Bento continua autorizado depois do GET");
  const p1 = await sair("POST", tokenBento);
  const ultima = await um("SELECT TOP 1 * FROM ComunicacaoConsentimentos WHERE MembroId = 8011 AND Canal = 'EMAIL' AND Categoria = 'EVENTOS' ORDER BY ConsentimentoId DESC");
  ok(p1.status === 200 && p1.body.jaEstava === false && ultima.Concedido === false && ultima.Origem === "LINK_SAIR" && ultima.EnvioId === env4.envioId && ultima.TextoHash === cm.HASH_SAIDA, "o botão grava o \"não\", com o envio de origem e o texto da saída", ultima);
  ok((await sair("POST", tokenBento)).body.jaEstava === true, "clicar de novo não grava outra linha");
  ok((await sair("GET", tokenBento.slice(0, -2) + "xx")).status === 404 && (await sair("POST", "lixo")).status === 404, "link adulterado: 404");
  ok((await um("SELECT TOP 1 CAST(Concedido AS INT) AS s FROM ComunicacaoConsentimentos WHERE MembroId = 8011 AND Canal = 'PUSH' AND Categoria = 'EVENTOS' ORDER BY ConsentimentoId DESC")).s === 1, "o celular do Bento continua (o link é só do e-mail)");

  console.log("== Meus comunicados ==");
  const meus = (await GET(H, "meus-comunicados", PIN(P.ana))).body.comunicados;
  ok(meus.length >= 2 && meus.some((c) => c.pedeCiencia && c.cienciaEm) && meus.every((c) => !/\{\{/.test(c.texto)), "a Ana vê os comunicados, preenchidos, com a ciência da convocação");
  ok((await GET(H, "meus-comunicados", PIN(P.beta))).body.comunicados.length === 0, "quem não estava no grupo não vê nada");

  console.log("== a fila sem abrir o banco, a retenção e a exclusão LGPD ==");
  const ctx = { bindingData: {}, log };
  await FILA(ctx, { method: "POST", query: {}, body: {}, headers: {} });
  ok(ctx.res.status === 401, "a rota da fila sem o segredo: 401");
  const ctx2 = { bindingData: {}, log };
  await FILA(ctx2, { method: "POST", query: {}, body: {}, headers: { "x-cron-secret": process.env.CRON_SECRET } });
  ok(ctx2.res.status === 200, "com o segredo, a rodada roda", ctx2.res.body);
  await q("UPDATE ComunicacaoEnvios SET CriadoEm = DATEADD(DAY, -400, CriadoEm) WHERE EnvioId IN (@a, @b)", { a: envioId, b: ec.envioId });
  const ret = await db.aplicarRetencao(pool);
  ok(ret.entregas > 0 && (await escalar("SELECT COUNT(*) FROM ComunicacaoEntregas WHERE EnvioId = @a AND MembroId IS NOT NULL", { a: envioId })) === 0, "depois de 1 ano o envio comum perde os nomes");
  ok((await escalar("SELECT COUNT(*) FROM ComunicacaoEntregas WHERE EnvioId = @b AND MembroId IS NOT NULL", { b: ec.envioId })) > 0, "a convocação guarda 5 anos (prova do ato)");
  const t = new L.sql.Transaction(pool);
  await t.begin();
  const lg = await db.exclusaoLgpd(() => new L.sql.Request(t), P.carla);
  await t.commit();
  ok(lg.consentimentos >= 2 && (await escalar("SELECT COUNT(*) FROM ComunicacaoConsentimentos WHERE MembroId = 8012")) === 0, "a exclusão LGPD apaga o histórico de consentimento (com a marca de purga)", lg);
  ok((await escalar("SELECT COUNT(*) FROM ComunicacaoEntregas WHERE MembroId = 8012")) === 0, "e as entregas perdem o nome");
  ok(!!(await falha("DELETE FROM ComunicacaoConsentimentos WHERE MembroId = 8010")), "fora da exclusão, a marca de purga não ficou ligada");
  const titular = await db.dadosDoTitular(pool, P.ana);
  ok(titular.consentimentos.length >= 3 && titular.comunicadosRecebidos >= 2, "Meus Dados mostra o histórico e quantos comunicados", titular.comunicadosRecebidos);

  fim("e2e-29 (comunicação)");
})().catch((e) => { console.log("ERRO:", e && e.stack); L.shimEncerrar(); process.exitCode = 1; });
