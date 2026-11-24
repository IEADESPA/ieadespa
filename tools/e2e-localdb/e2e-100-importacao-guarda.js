// e2e-100-importacao-guarda.js — A GUARDA DOS DADOS DA IMPORTAÇÃO (respostas dele de 23/11/2026, LGPD; a importação dos membros do sistema pago, migração 185),
// contra o SQL Server de verdade. Só dados de mentira (nomes, celulares, mães e pais inventados; sem CPF). O que se prova:
//   1. a prévia que não foi confirmada (com o celular, a mãe e o pai de cada linha) se apaga sozinha em 7 dias pela rotina diária: com 6 dias fica; com 8 sai
//      (as linhas saem do banco e ela fica DESCARTADA, com a trilha "A rotina descartou..." sem usuário); rodar de novo não faz nada;
//   2. o botão "Descartar": a rota apaga a prévia na hora (a liderança local não pode: 403 e a prévia fica); descartar de novo, 409;
//   3. a lista dos que ficaram de fora (nome e motivo) fica 90 dias depois de a importação terminar: com 89 fica; com 91 só as linhas de fora saem (as importadas
//      e o retrato do resultado ficam), o resumo guarda o dia em que saiu (em UTC, com o Z) e a trilha diz quantas; rodar de novo não faz nada;
//   4. os prazos chegam à tela pelo estado; a rotina diária de verdade (NotificacoesAgendador) roda a guarda sem falha; a cadeia de hashes da trilha confere.
// Roda sobre a base cenario-185: `BASE=cenario-185 bash rodar.sh roteiro e2e-100-importacao-guarda.js`.
process.env.AUTH_SECRET = "segredo-da-guarda-da-importacao-" + "x".repeat(24);
process.env.CRON_SECRET = process.env.CRON_SECRET || "segredo-da-rotina-e2e";
const crypto = require("crypto");
const L = require("./lib");
const { ok, fim, q, um, escalar, obterPool, API, path } = L;
// os canais de mentira ANTES de carregar os handlers (a rotina diária manda avisos)
const emailMod = require(path.join(API, "shared/notificacaoEmail.js"));
emailMod.enviarEmailComunicado = async () => ({ ok: true });
emailMod.enviarEmailNotificacao = async () => true;
const pushMod = require(path.join(API, "shared/notificacaoPush.js"));
pushMod.enviarPushNotificacao = async () => 1;
const erroOriginal = console.error;
console.error = (...a) => { if (process.env.E2E_VERBOSO) erroOriginal(...a); };

const PERM = ["pessoas"];
const fator = () => ({ via: "CHAVE", em: Date.now() });
const CONG = "Vila Guarda E2E100";
const tok = {
  geral: () => L.sessao(9910, { via: "SENHA", fator: fator(), nivel: "GLOBAL", escopoCongregacoes: "TODAS", permissoes: PERM }),
  local: (cong) => L.sessao(9911, { via: "SENHA", fator: fator(), nivel: "CONGREGACAO", escopoCongregacoes: [cong], permissoes: PERM })
};
const sha256 = (t) => crypto.createHash("sha256").update(String(t), "utf8").digest("hex");
const CAB = "MATRÍCULA;NOME;IGREJA;SEXO;CELULAR;MÃE;PAI";
const pessoa = (mat, nome, igreja = CONG) => `${mat};${nome};IEADESPA - ${igreja};FEMININO;(91) 90000-${String(mat).slice(-4)};Mãe de ${nome};Pai de ${nome}`;
const arquivo = (linhas) => [CAB, ...linhas].join("\r\n");

async function principal() {
  const { chamarRota } = require("./lib-afm");
  const db = require(path.join(API, "shared/importacaoMembrosDb.js"));
  const AGENDADOR = require(path.join(API, "NotificacoesAgendador/index.js"));
  const pool = await obterPool();
  const R = (token, { metodo = "GET", acao = "", corpo, query } = {}) =>
    chamarRota("ImportacaoMembros/index.js", { metodo, token, binding: { acao }, corpo: corpo || {}, query: query || {} });
  const linhasDe = (id) => escalar("SELECT COUNT(*) FROM ImportacoesMembrosLinhas WHERE ImportacaoId = @i", { i: id });
  const pessoaisDe = (id) => escalar("SELECT COUNT(*) FROM ImportacoesMembrosLinhas WHERE ImportacaoId = @i AND (Telefone IS NOT NULL OR NomeMae IS NOT NULL OR NomePai IS NOT NULL)", { i: id });
  const situacao = (id) => um("SELECT Situacao, DescartadaEm, Resumo FROM ImportacoesMembros WHERE ImportacaoId = @i", { i: id });
  // o tempo passa: as datas da importação vão para trás (todas juntas, para a ordem delas continuar de pé)
  const voltar = (id, dias) => q(`UPDATE ImportacoesMembros SET CriadaEm = DATEADD(DAY, -@d, CriadaEm), ConfirmadaEm = DATEADD(DAY, -@d, ConfirmadaEm),
    ConcluidaEm = DATEADD(DAY, -@d, ConcluidaEm) WHERE ImportacaoId = @i`, { i: id, d: dias });
  const trilha = (acao) => q("SELECT AuditId, RegistroId, Acao, UsuarioId, DadosDepois FROM AuditLog WHERE Tabela = N'ImportacoesMembros' AND Acao LIKE @a ORDER BY AuditId", { a: acao });

  console.log("== o cenário ==");
  ok(await escalar("SELECT COUNT(*) FROM ImportacoesMembros") === 0, "nenhuma importação ainda (a base cenario-185)");
  const area = (await q("INSERT INTO Areas (Nome) VALUES (N'Área E2E100'); SELECT CAST(SCOPE_IDENTITY() AS INT) AS id"))[0].id;
  const cong = (await q("INSERT INTO Congregacoes (Nome, AreaId) VALUES (@n, @a); SELECT CAST(SCOPE_IDENTITY() AS INT) AS id", { n: CONG, a: area }))[0].id;
  await q(`IF NOT EXISTS (SELECT 1 FROM MembroReferencia WHERE MembroId = 9910) INSERT INTO MembroReferencia (MembroId, Nome, CongregacaoId, Status, SituacaoMembro)
    VALUES (9910, N'Secretaria Geral E2E100', @c, N'ATIVO', N'EM_COMUNHAO')`, { c: cong });
  const auditAntes = await escalar("SELECT ISNULL(MAX(AuditId), 0) FROM AuditLog");
  const est0 = await R(tok.geral());
  ok(est0.status === 200 && est0.body.guarda && est0.body.guarda.diasPrevia === 7 && est0.body.guarda.diasFora === 90, "o estado leva os prazos para a tela: 7 e 90 dias", est0.body.guarda);

  console.log("== 1. a prévia que não foi confirmada se apaga sozinha em 7 dias ==");
  const pA = await R(tok.geral(), { metodo: "POST", acao: "previa", corpo: { nomeArquivo: "membros-a.csv", texto: arquivo([pessoa(991001, "Ana Prévia E2E100"), pessoa(991002, "Bia Prévia E2E100")]) } });
  ok(pA.status === 200 && pA.body.sucesso === true, "a prévia A: 200", pA.body);
  const idA = pA.body.importacaoId;
  ok(await linhasDe(idA) === 2 && await pessoaisDe(idA) === 2, "a prévia guarda as 2 linhas com o celular, a mãe e o pai");
  await voltar(idA, 6);
  let r = await db.aplicarRetencao(pool);
  ok(r.previasDescartadas === 0 && r.diasPrevia === 7, "com 6 dias: a rotina não mexe", r);
  ok((await situacao(idA)).Situacao === "PREVIA" && await linhasDe(idA) === 2, "a prévia A continua, com as linhas");
  await voltar(idA, 2);
  r = await db.aplicarRetencao(pool);
  ok(r.previasDescartadas === 1 && r.linhasForaApagadas === 0, "com 8 dias: a rotina descarta 1 prévia", r);
  const sA = await situacao(idA);
  ok(sA.Situacao === "DESCARTADA" && sA.DescartadaEm !== null, "a prévia A ficou DESCARTADA, com o dia", sA);
  ok(await linhasDe(idA) === 0, "as linhas da prévia (com os dados pessoais) saíram do banco");
  const tA = await trilha("A rotina descartou%");
  ok(tA.length === 1 && tA[0].RegistroId === idA && tA[0].UsuarioId === null && tA[0].Acao === "A rotina descartou a prévia da importação que não foi confirmada em 7 dias",
    "a trilha: 'A rotina descartou...' sem usuário", tA);
  r = await db.aplicarRetencao(pool);
  ok(r.previasDescartadas === 0 && r.linhasForaApagadas === 0 && (await trilha("A rotina%")).length === 1, "rodar de novo: nada muda e nada vai para a trilha", r);
  const eA = await R(tok.geral());
  ok(eA.body.importacao === null && eA.body.feita === false, "o estado: sem prévia (a tela volta ao arquivo)", eA.body.importacao);

  console.log("== 2. o botão Descartar apaga na hora ==");
  const pB = await R(tok.geral(), { metodo: "POST", acao: "previa", corpo: { nomeArquivo: "membros-b.csv", texto: arquivo([pessoa(991011, "Caio Descarte E2E100")]) } });
  ok(pB.status === 200, "a prévia B: 200", pB.body);
  const idB = pB.body.importacaoId;
  const dL = await R(tok.local(cong), { metodo: "POST", acao: "descartar", corpo: { importacaoId: idB } });
  ok(dL.status === 403, "a liderança local não descarta: 403", dL.status);
  ok((await situacao(idB)).Situacao === "PREVIA" && await linhasDe(idB) === 1, "e a prévia B fica");
  const dB = await R(tok.geral(), { metodo: "POST", acao: "descartar", corpo: { importacaoId: idB } });
  ok(dB.status === 200 && dB.body.sucesso === true, "a Secretaria Geral descarta: 200", dB.body);
  ok((await situacao(idB)).Situacao === "DESCARTADA" && await linhasDe(idB) === 0, "na hora: DESCARTADA e sem as linhas");
  const tB = await trilha("Descartou a prévia%");
  ok(tB.length === 1 && tB[0].RegistroId === idB && tB[0].UsuarioId === 9910, "a trilha: 'Descartou a prévia' com quem descartou", tB);
  const dB2 = await R(tok.geral(), { metodo: "POST", acao: "descartar", corpo: { importacaoId: idB } });
  ok(dB2.status === 409, "descartar de novo: 409 (a prévia já não está aberta)", dB2.body);
  const dX = await R(tok.geral(), { metodo: "POST", acao: "descartar", corpo: { importacaoId: "1; DROP TABLE ImportacoesMembros --" } });
  ok(dX.status === 400 && await escalar("SELECT COUNT(*) FROM ImportacoesMembros") === 2, "lixo na importação: 400 e nada muda", dX.body);

  console.log("== 3. a lista dos que ficaram de fora fica 90 dias depois do fim ==");
  const pC = await R(tok.geral(), { metodo: "POST", acao: "previa", corpo: { nomeArquivo: "membros-c.csv", texto: arquivo([
    pessoa(991021, "Davi Importado E2E100"), pessoa(991022, "Eva Importada E2E100"), pessoa(991023, "Fábio De Fora E2E100", "Congregação Que Não Existe E2E100")]) } });
  ok(pC.status === 200 && pC.body.resumo.problemas === 1, "a prévia C: 1 de fora (a congregação não existe)", pC.body.resumo && pC.body.resumo.problemas);
  const idC = pC.body.importacaoId;
  const cC = await R(tok.geral(), { metodo: "POST", acao: "confirmar", corpo: { importacaoId: idC } });
  ok(cC.status === 200, "confirmada", cC.body);
  const lC = await R(tok.geral(), { metodo: "POST", acao: "lote", corpo: { importacaoId: idC } });
  ok(lC.status === 200 && lC.body.concluida === true && lC.body.resultado.importadas === 2 && lC.body.resultado.fora === 1, "concluída: 2 importadas e 1 de fora", lC.body);
  const foraDe = (id) => escalar("SELECT COUNT(*) FROM ImportacoesMembrosLinhas WHERE ImportacaoId = @i AND Estado = N'FORA'", { i: id });
  const importadasDe = (id) => escalar("SELECT COUNT(*) FROM ImportacoesMembrosLinhas WHERE ImportacaoId = @i AND Estado = N'IMPORTADA'", { i: id });
  await voltar(idC, 89);
  r = await db.aplicarRetencao(pool);
  ok(r.linhasForaApagadas === 0 && await foraDe(idC) === 1, "com 89 dias: a lista dos de fora fica", r);
  const csv89 = await R(tok.geral(), { acao: "lista.csv", query: { importacaoId: idC } });
  ok(String(csv89.body).includes("Fábio De Fora E2E100"), "e o CSV ainda tem quem ficou de fora");
  await voltar(idC, 2);
  r = await db.aplicarRetencao(pool);
  ok(r.linhasForaApagadas === 1 && r.previasDescartadas === 0 && r.diasFora === 90, "com 91 dias: 1 linha de fora apagada", r);
  ok(await foraDe(idC) === 0 && await importadasDe(idC) === 2, "só a de fora saiu; as 2 importadas ficam (a ficha é o registro delas)");
  const sC = await situacao(idC);
  const resumoC = JSON.parse(sC.Resumo);
  ok(sC.Situacao === "CONCLUIDA" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(resumoC.foraApagadaEm || "") && resumoC.resultado && resumoC.resultado.fora === 1,
    "o resumo guarda o dia em que a lista saiu (UTC, com o Z) e o número de antes continua", resumoC.foraApagadaEm);
  const tC = await trilha("A rotina apagou a lista%");
  ok(tC.length === 1 && tC[0].RegistroId === idC && tC[0].UsuarioId === null && JSON.stringify(JSON.parse(tC[0].DadosDepois)) === JSON.stringify({ linhasApagadas: 1, retencaoDias: 90 }),
    "a trilha: quantas saíram e o prazo, sem nome", tC);
  const eC = await R(tok.geral());
  ok(eC.body.feita === true && eC.body.retrato && eC.body.retrato.porArea.reduce((s, a) => s + a.fichas, 0) === 2 && eC.body.importacao.resumo.foraApagadaEm === resumoC.foraApagadaEm,
    "o resultado continua: feita, o retrato com as 2 fichas e o dia em que a lista saiu", eC.body.retrato);
  const lpC = await R(tok.geral(), { acao: "lista", query: { importacaoId: String(idC), filtro: "problemas" } });
  ok(lpC.status === 200 && lpC.body.total === 0, "a lista 'problemas' fica vazia", lpC.body.total);
  const csv91 = await R(tok.geral(), { acao: "lista.csv", query: { importacaoId: idC } });
  // (o CSV só lista quem tem problema ou aviso: as importadas sem aviso nunca estiveram nele)
  ok(csv91.status === 200 && !String(csv91.body).includes("Fábio De Fora E2E100"), "o CSV sem quem ficou de fora", csv91.status);
  r = await db.aplicarRetencao(pool);
  ok(r.linhasForaApagadas === 0 && (await trilha("A rotina apagou a lista%")).length === 1, "rodar de novo: nada muda e nada vai para a trilha", r);

  console.log("== 4. a rotina diária de verdade ==");
  const ctxR = { bindingData: {}, log: Object.assign(() => { }, { error() { }, info() { }, warn() { }, verbose() { } }) };
  await AGENDADOR(ctxR, { method: "POST", headers: { "x-cron-secret": process.env.CRON_SECRET }, query: {}, body: {} });
  const ra = ((ctxR.res && ctxR.res.body) || {}).retencaoAnotadas || {};
  ok(ra.importacaoMembros && ra.importacaoMembros.diasPrevia === 7 && ra.importacaoMembros.diasFora === 90 && !(ra.falhas || []).includes("importacaoMembros"),
    "a NotificacoesAgendador roda a guarda da importação sem falha", ra);

  console.log("== a trilha ==");
  const marcas = await q("SELECT AuditId, Tabela, RegistroId, Acao, UsuarioId, DadosAntes, DadosDepois, HashRegistro FROM AuditLog WHERE AuditId > @a AND Tabela = N'ImportacoesMembros' ORDER BY AuditId", { a: auditAntes });
  ok(!marcas.some((t) => /Prévia E2E100|Descarte E2E100|Importad[oa] E2E100|De Fora E2E100|Mãe de|Pai de|90000-/.test(`${t.Acao} ${t.DadosAntes || ""} ${t.DadosDepois || ""}`)),
    "nenhum nome, celular, mãe ou pai das linhas na trilha");
  let cadeiaOk = true;
  for (const t of marcas) {
    const ant = await escalar("SELECT TOP 1 HashRegistro FROM AuditLog WHERE Tabela = N'ImportacoesMembros' AND AuditId < @a ORDER BY AuditId DESC", { a: t.AuditId });
    const payload = JSON.stringify({ tabela: t.Tabela, registroId: t.RegistroId, acao: t.Acao, usuarioId: t.UsuarioId || null, dadosAntes: t.DadosAntes, dadosDepois: t.DadosDepois });
    if (sha256(payload + (ant || "")) !== t.HashRegistro) cadeiaOk = false;
  }
  ok(cadeiaOk, "a cadeia de hashes da trilha da importação confere (também nas marcas da rotina, sem usuário)");
  fim("e2e-100 (a guarda dos dados da importação)");
}

principal().catch((e) => { console.error = erroOriginal; console.error(e); process.exitCode = 1; L.shimEncerrar(); });
