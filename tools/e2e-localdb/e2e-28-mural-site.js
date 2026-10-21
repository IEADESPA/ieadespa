// e2e-28-mural-site.js — v7.11.1 (o mural de oração do site entra no cuidado pastoral), com os handlers e a rotina REAIS, sobre a base "cenario-pastoral" + a migração 149.
// O esquema (o pedido do site não tem congregação, só o nível geral, nunca boletim; a origem não muda depois), a rota do site que falha fechada, o pedido comum que não toca no
// banco, o confidencial e o com risco guardados, o aviso na hora ao nível geral sem o texto, o mesmo pedido reenviado, a tela da Diretoria (quem vê, o que dá para fazer), a
// rotina diária e a retenção com o pedido sem congregação.
const L = require("./lib");
const { ok, fim, q, um, escalar, obterPool, API, path, GET, POST, LIDER, GERAL } = L;
process.env.CRON_SECRET = "segredo-da-rotina-e2e";
process.env.CHAVE_SITE_SISTEMA = "chave-e2e-do-site";
const H = require(path.join(API, "GestaoCuidadoPastoral/index.js"));
const SITE = require(path.join(API, "CuidadoPastoralSite/index.js"));
const AGENDADOR = require(path.join(API, "NotificacoesAgendador/index.js"));
const db = require(path.join(API, "shared/cuidadoPastoralDb.js"));

const PERM = ["cuidado_pastoral", "pessoas"];
const C = "Central E2E";
const DIR_C = LIDER(3001, PERM, [C]), PAREA = LIDER(3003, PERM, [C, "Vila Nova E2E"], "AREA"), SEC = GERAL(1002, ["cuidado_pastoral", "protecaodedados"]);
const log = Object.assign(() => { }, { error() { }, info() { }, warn() { }, verbose() { } });
async function doSite(corpo, chave = process.env.CHAVE_SITE_SISTEMA) {
  const ctx = { bindingData: {}, log };
  await SITE(ctx, { method: "POST", query: {}, body: corpo, headers: { ...(chave ? { "x-site-key": chave } : {}), "x-forwarded-for": "200.1.2.3, 10.0.0.1" } });
  return ctx.res;
}
const rotina = async () => { const ctx = { bindingData: {}, log }; await AGENDADOR(ctx, { method: "POST", query: {}, body: {}, headers: { "x-cron-secret": process.env.CRON_SECRET } }); return ctx.res; };
const falha = async (texto, params) => { try { await q(texto, params); return null; } catch (e) { return e.message || String(e); } };
const pedidosDoSite = () => escalar("SELECT COUNT(*) FROM PedidosOracao WHERE Origem = 'SITE'");

(async () => {
  await obterPool();
  const c1 = await escalar("SELECT CongregacaoId FROM Congregacoes WHERE Nome = @n", { n: C });
  await q("DELETE FROM PedidosOracao WHERE Origem = 'SITE'").catch(() => { });

  console.log("== o esquema da 149 ==");
  ok((await um("SELECT is_nullable FROM sys.columns WHERE object_id = OBJECT_ID('PedidosOracao') AND name = 'CongregacaoId'")).is_nullable === true, "CongregacaoId aceita vazio (só o do site)");
  ok((await escalar("SELECT COUNT(*) FROM PedidosOracao WHERE Origem IS NULL OR Origem <> 'SISTEMA'")) === 0 && (await escalar("SELECT COUNT(*) FROM PedidosOracao")) > 0, "os pedidos que já existiam ficaram com origem SISTEMA");
  ok(!!(await falha("INSERT INTO PedidosOracao (CongregacaoId, ParaQuem, Categoria, Texto, PodeBoletim, QuerContato, SoNivelGeral, Origem) VALUES (NULL, 'PROPRIO', 'OUTRO', N'x', 0, 0, 1, 'SISTEMA')")), "pedido do SISTEMA sem congregação: recusado");
  ok(!!(await falha("INSERT INTO PedidosOracao (CongregacaoId, ParaQuem, Categoria, Texto, PodeBoletim, QuerContato, SoNivelGeral, Origem) VALUES (@c, 'PROPRIO', 'OUTRO', N'x', 0, 0, 1, 'SITE')", { c: c1 })), "pedido do SITE com congregação: recusado");
  ok(!!(await falha("INSERT INTO PedidosOracao (CongregacaoId, ParaQuem, Categoria, Texto, PodeBoletim, QuerContato, SoNivelGeral, Origem) VALUES (NULL, 'PROPRIO', 'OUTRO', N'x', 1, 0, 1, 'SITE')")), "pedido do SITE que pode ir ao boletim: recusado");
  ok(!!(await falha("INSERT INTO PedidosOracao (CongregacaoId, ParaQuem, Categoria, Texto, PodeBoletim, QuerContato, SoNivelGeral, Origem) VALUES (NULL, 'PROPRIO', 'OUTRO', N'x', 0, 0, 0, 'SITE')")), "pedido do SITE fora do nível geral: recusado");
  ok(!!(await falha("INSERT INTO PedidosOracao (CongregacaoId, ParaQuem, Categoria, Texto, PodeBoletim, QuerContato, SoNivelGeral, Origem) VALUES (NULL, 'PROPRIO', 'OUTRO', N'x', 0, 0, 1, 'OUTRA')")), "origem desconhecida: recusada");

  console.log("== a rota do site ==");
  ok((await doSite({ texto: "quero morrer", confidencial: false }, null)).status === 401 && (await doSite({ texto: "quero morrer", confidencial: false }, "errada")).status === 401, "sem a chave ou com a chave errada: 401");
  ok((await pedidosDoSite()) === 0, "e nada foi gravado");
  const comum = await doSite({ texto: "pela saúde da minha avó", nome: "Rute", confidencial: false, siteItemId: 501 });
  ok(comum.status === 200 && comum.body.gravado === false && comum.body.risco === false && (await pedidosDoSite()) === 0, "o pedido comum não é guardado no sistema (fica só no site)", comum.body);
  const conf = await doSite({ texto: "um assunto <b>da família</b> que só a pastoral deve saber", nome: "Marta", confidencial: true, siteItemId: 502 });
  ok(conf.status === 200 && conf.body.gravado === true && conf.body.risco === false, "o confidencial é guardado", conf.body);
  const pConf = await um("SELECT * FROM PedidosOracao WHERE Origem = 'SITE' AND SiteItemId = 502");
  ok(pConf && pConf.CongregacaoId === null && pConf.SoNivelGeral === true && pConf.PodeBoletim === false && pConf.SolicitanteMembroId === null && pConf.SolicitanteNome === "Marta", "sem congregação, só o nível geral, nunca boletim, sem membro", pConf);
  ok(pConf.Texto === "um assunto ‹b›da família‹/b› que só a pastoral deve saber", "o texto chega limpo (sem marcação)", pConf.Texto);
  ok(!!(await falha("UPDATE PedidosOracao SET Origem = 'SISTEMA', CongregacaoId = @c, SoNivelGeral = 0 WHERE PedidoId = @p", { c: c1, p: pConf.PedidoId })), "a origem não muda depois");
  ok(!!(await falha("UPDATE PedidosOracao SET SiteItemId = 999 WHERE PedidoId = @p", { p: pConf.PedidoId })), "nem o número do item do site");

  const antes = await escalar("SELECT COUNT(*) FROM Notificacoes WHERE RegraChave = 'CUIDADO_RISCO'");
  const risco = await doSite({ texto: "não aguento mais, penso em tirar minha vida", confidencial: false, siteItemId: 503 });
  ok(risco.status === 200 && risco.body.gravado === true && risco.body.risco === true, "com sinal de risco: guardado e o site fica sabendo (para mostrar o 188 e o 190)", risco.body);
  const pRisco = await um("SELECT * FROM PedidosOracao WHERE Origem = 'SITE' AND SiteItemId = 503");
  ok(pRisco.Risco === true && pRisco.RiscoOrigem === "AUTOMATICO" && pRisco.RiscoMarcadoEm, "o pedido nasce com o sinal de risco");
  const avisos = await q("SELECT DestinatarioMembroId, Mensagem FROM Notificacoes WHERE RegraChave = 'CUIDADO_RISCO' AND ReferenciaTabela = 'PedidosOracaoSite' AND ReferenciaId = @p", { p: pRisco.PedidoId });
  ok((await escalar("SELECT COUNT(*) FROM Notificacoes WHERE RegraChave = 'CUIDADO_RISCO'")) > antes && avisos.length > 0, "o nível geral é avisado NA HORA", avisos.length);
  const geral = new Set((await q(`SELECT DISTINCT d.MembroId FROM (SELECT DestinatarioMembroId AS MembroId FROM Notificacoes WHERE ReferenciaTabela = 'PedidosOracaoSite' AND ReferenciaId = @p) d`, { p: pRisco.PedidoId })).map((r) => r.MembroId));
  ok(!geral.has(3001) && !geral.has(3003), "o Dirigente e o Pastor de Área não recebem (o site não diz a congregação)", [...geral]);
  ok(avisos.every((a) => /mural de oração do SITE/.test(a.Mensagem) && !/aguento|vida/.test(a.Mensagem)), "o aviso diz de onde veio e não leva o texto", avisos[0] && avisos[0].Mensagem);
  const repetido = await doSite({ texto: "não aguento mais, penso em tirar minha vida", confidencial: false, siteItemId: 504 });
  ok(repetido.body.gravado === true && repetido.body.risco === true && (await escalar("SELECT COUNT(*) FROM PedidosOracao WHERE Origem = 'SITE' AND Risco = 1")) === 1, "o mesmo texto reenviado em 10 minutos é o mesmo pedido");
  ok((await escalar("SELECT COUNT(*) FROM Notificacoes WHERE ReferenciaTabela = 'PedidosOracaoSite'")) === avisos.length, "e não avisa de novo");
  const auditoria = await q("SELECT CAST(Detalhes AS NVARCHAR(MAX)) AS d FROM AuditLog WHERE Tabela = 'PedidosOracao' AND RegistroId IN (@a, @b)", { a: pConf.PedidoId, b: pRisco.PedidoId }).catch(() => []);
  ok(auditoria.every((a) => !/aguento|família|Marta/.test(a.d || "")), "a auditoria não guarda o texto nem o nome");

  console.log("== na tela da Diretoria ==");
  const daSec = (await GET(H, "pedidos", SEC)).body.pedidos;
  const vistoConf = daSec.find((p) => p.pedidoId === pConf.PedidoId);
  ok(vistoConf && vistoConf.origem === "SITE" && vistoConf.siteItemId === 502 && vistoConf.congregacaoNome === "Mural de oração do site", "o nível geral vê o confidencial do site, com a origem", vistoConf);
  ok((await GET(H, "pedidos", SEC, { situacao: "RISCO" })).body.pedidos.some((p) => p.pedidoId === pRisco.PedidoId), "e o com risco na aba do sinal de risco");
  for (const [quem, s] of [["o Dirigente", DIR_C], ["o Pastor de Área", PAREA]]) {
    const lista = [...(await GET(H, "pedidos", s)).body.pedidos, ...(await GET(H, "pedidos", s, { situacao: "RISCO" })).body.pedidos, ...((await GET(H, "pedidos", s, { situacao: "TODOS" })).body.pedidos || [])];
    ok(!lista.some((p) => p.origem === "SITE"), `${quem} não vê pedido do site em aba nenhuma`);
    ok((await POST(H, "moderar", s, { pedidoId: pConf.PedidoId, decisao: "NAO_PUBLICAR" })).status === 404, `${quem} não modera o pedido do site (404)`);
  }
  ok((await POST(H, "moderar", SEC, { pedidoId: pConf.PedidoId, decisao: "APROVAR" })).status === 422, "o pedido do site não vai ao boletim");
  ok((await POST(H, "acompanhar-pedido", SEC, { pedidoId: pConf.PedidoId })).status === 422, "nem abre acompanhamento (não há congregação nem contato)");
  const itensAntes = await escalar("SELECT COUNT(*) FROM CuidadoItens");
  const marcou = await POST(H, "risco", SEC, { pedidoId: pConf.PedidoId, marcar: true });
  ok(marcou.status === 200 && marcou.body.itemId === null, "marcar o risco no pedido do site passa, sem abrir item", marcou.body);
  ok((await escalar("SELECT COUNT(*) FROM CuidadoItens")) === itensAntes, "nenhum item novo na fila");
  ok((await escalar("SELECT COUNT(*) FROM Notificacoes WHERE ReferenciaTabela = 'PedidosOracaoSite' AND ReferenciaId = @r", { r: pConf.PedidoId * 10 + 1 })) > 0, "e o nível geral é avisado");
  const leu = await POST(H, "moderar", SEC, { pedidoId: pRisco.PedidoId, decisao: "NAO_PUBLICAR" });
  ok(leu.status === 422, "o com risco não sai como lido sem desmarcar antes (mesma regra do sistema)");

  console.log("== a rotina diária e a retenção ==");
  const r = await rotina();
  ok(r && r.status === 200, "a rotina roda com pedido sem congregação", r && r.body);
  ok(!JSON.stringify((r && r.body) || {}).includes("falhas\":[\""), "sem passo falhando", r && r.body);
  await q("DISABLE TRIGGER ALL ON PedidosOracao; UPDATE PedidosOracao SET CriadoEm = DATEADD(DAY, -800, SYSUTCDATETIME()) WHERE Origem = 'SITE'; ENABLE TRIGGER ALL ON PedidosOracao");
  const ret = await db.aplicarRetencao(await obterPool());
  ok(ret.pedidos >= 2, "a retenção anonimiza os pedidos antigos do site", ret);
  ok((await escalar("SELECT COUNT(*) FROM PedidosOracao WHERE Origem = 'SITE' AND (Texto IS NOT NULL OR SolicitanteNome IS NOT NULL)")) === 0, "sem texto nem nome");
  await q("DELETE FROM PedidosOracao WHERE Origem = 'SITE'").catch(() => { });

  fim("e2e-28 (mural do site)");
})().catch((e) => { console.log("ERRO:", e && e.stack); L.shimEncerrar(); process.exitCode = 1; });
