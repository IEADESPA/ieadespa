// e2e-34-crise-corridas.js — v7.15 (crise e segurança): corridas de verdade (N processos node, cada um com a sua conexão ao SQL Server) sobre a base "cenario-crise".
// Quatro pessoas abrindo o regime ao mesmo tempo: uma abre, as outras ouvem "já há crise"; a troca do porta-voz e o encerramento disputando: o histórico fica numa ordem que
// existe; encerrar quatro vezes ao mesmo tempo: um encerramento e um aviso de fim; seis manifestações ao mesmo tempo: todas gravadas; quatro correções da MESMA manifestação: uma;
// quatro primeiras respostas ao mesmo pedido: uma; o plano salvo por dois em cima da mesma versão: um; a mesma pessoa posta na equipe por quatro: uma.
// Cada processo filho roda este mesmo arquivo com o primeiro argumento "filho".
process.env.AUTH_SECRET = "segredo-das-corridas-da-crise-" + "x".repeat(24);
const fs = require("fs");
const os = require("os");
const { spawn } = require("child_process");
const L = require("./lib");
const { path, API } = L;

const VER_SEC = { membroId: 1002, crise: true, seguranca: true, geralSeguranca: true, podeVerCongregacao: () => true };
const PV = { tipo: "PRESIDENTE", contato: "(91) 3333-4444" };

async function filho() {
  const spec = JSON.parse(process.argv[3]);
  // os canais de mentira antes de carregar a comunicação: o e-mail anota num arquivo o que "saiu"; o celular entrega 1 aparelho
  const emailMod = require(path.join(API, "shared/notificacaoEmail.js"));
  emailMod.enviarEmailComunicado = async (m) => { if (spec.arquivo) fs.appendFileSync(spec.arquivo, `${m.email}|${m.assunto}\n`); return { ok: true }; };
  emailMod.enviarEmailNotificacao = async () => true;
  require(path.join(API, "shared/notificacaoPush.js")).enviarPushNotificacao = async () => 1;
  const db = require(path.join(API, "shared/criseSegurancaDb.js"));
  const pool = await L.obterPool();
  const espera = spec.t0 - Date.now();
  if (espera > 0) await new Promise((r) => setTimeout(r, espera));
  let r;
  try {
    const ver = { ...VER_SEC, membroId: spec.membroId || 1002 };
    if (spec.tipo === "abrir") r = await db.abrir(pool, { ver, dados: { motivo: `Corrida ${spec.n}`, portaVoz: PV } });
    else if (spec.tipo === "encerrar") r = await db.encerrar(pool, { ver, criseId: spec.criseId, dados: { resumo: `Fim ${spec.n}` } });
    else if (spec.tipo === "porta-voz") r = await db.designarPortaVoz(pool, { ver, criseId: spec.criseId, dados: { portaVoz: { tipo: "DESIGNADO", nome: "Assessora Corrida", contato: "assessoria@e2e.invalid", ato: "Ato 99/2026" } } });
    else if (spec.tipo === "manifestacao") r = await db.registrarManifestacao(pool, { ver, dados: spec.dados });
    else if (spec.tipo === "responder") r = await db.responderDemanda(pool, { ver, dados: spec.dados });
    else if (spec.tipo === "plano") r = await db.salvarPlano(pool, { ver, congregacaoId: spec.congregacaoId, dados: spec.dados });
    else if (spec.tipo === "equipe") r = await db.adicionarEquipe(pool, { ver, congregacaoId: spec.congregacaoId, dados: spec.dados });
    process.stdout.write("@@RESULTADO@@" + JSON.stringify({ ok: true, r: { sucesso: r.sucesso, mudou: !!r.mudou, limite: !!r.limite, mensagem: r.mensagem, criseId: r.criseId } }) + "\n");
  } catch (e) {
    process.stdout.write("@@RESULTADO@@" + JSON.stringify({ ok: false, erro: e && e.message }) + "\n");
  }
  L.shimEncerrar();
}

async function disparar(specs) {
  const t0 = Date.now() + 7000 + specs.length * 800;
  return Promise.all(specs.map((spec) => new Promise((resolve) => {
    const p = spawn(process.execPath, ["-r", path.join(__dirname, "shim-mssql.js"), __filename, "filho", JSON.stringify({ ...spec, t0 })], { env: process.env });
    let saida = ""; p.stdout.on("data", (d) => { saida += d; });
    p.on("exit", () => { const m = saida.split("\n").find((l) => l.startsWith("@@RESULTADO@@")); resolve(m ? JSON.parse(m.slice(13)) : { ok: false, erro: "sem resultado" }); });
  })));
}
const dataHoraAgora = (minutos = 0) => new Date(Date.now() - 3 * 3600000 + minutos * 60000).toISOString().slice(0, 16);

async function principal() {
  const { ok, fim, q, escalar } = L;
  await L.obterPool();
  const c1 = await escalar("SELECT CongregacaoId FROM Congregacoes WHERE Nome = N'Central E2E'");
  const arquivo = path.join(os.tmpdir(), `e2e-34-emails-${process.pid}.txt`);
  fs.writeFileSync(arquivo, "");
  await q("UPDATE Prazos SET Dias = 20 WHERE Sigla = 'COMUNICACAO_EMAILS_POR_RODADA'; UPDATE Prazos SET Dias = 60 WHERE Sigla = 'COMUNICACAO_EMAILS_POR_HORA'");

  console.log("== quatro pessoas abrem o regime ao mesmo tempo ==");
  let rs = await disparar([1, 2, 3, 4].map((n) => ({ tipo: "abrir", n, membroId: n % 2 ? 1002 : 1001, arquivo })));
  ok(rs.every((x) => x.ok), "os quatro terminam sem erro", rs.filter((x) => !x.ok));
  const venceram = rs.filter((x) => x.r && x.r.sucesso);
  ok(venceram.length === 1 && rs.filter((x) => x.r && !x.r.sucesso).every((x) => x.r.mudou || x.r.limite), "UM abre; os outros ouvem que já há crise (ou que tentem de novo)", rs.map((x) => x.r));
  ok((await escalar("SELECT COUNT(*) FROM CriseRegimes WHERE Status = 'ATIVA'")) === 1 && (await escalar("SELECT COUNT(*) FROM CriseHistorico WHERE Evento = 'ABERTA'")) === 1, "no banco: uma crise ativa, uma abertura no histórico");
  ok((await escalar("SELECT COUNT(*) FROM ComunicacaoEnvios WHERE Categoria = 'CRISE'")) === 1, "e um aviso só (nenhum aviso órfão de uma abertura que perdeu)");
  const criseId = await escalar("SELECT CriseId FROM CriseRegimes WHERE Status = 'ATIVA'");

  console.log("== seis manifestações ao mesmo tempo; depois quatro correções da mesma ==");
  const MAN = { criseId, dataHora: dataHoraAgora(-10), canal: "ENTREVISTA", quemFalou: "Presidente E2E", resumo: "Entrevista à rádio sobre o caso.", autorizadoPor: "Presidente E2E" };
  rs = await disparar([1, 2, 3, 4, 5, 6].map((n) => ({ tipo: "manifestacao", dados: { ...MAN, resumo: `${MAN.resumo} (${n})` } })));
  ok(rs.every((x) => x.ok && x.r.sucesso), "as seis são gravadas", rs.map((x) => x.r));
  ok((await escalar("SELECT COUNT(*) FROM CriseManifestacoes WHERE CriseId = @c", { c: criseId })) === 6, "seis linhas no banco");
  const alvo = await escalar("SELECT MIN(ManifestacaoId) FROM CriseManifestacoes WHERE CriseId = @c", { c: criseId });
  rs = await disparar([1, 2, 3, 4].map((n) => ({ tipo: "manifestacao", dados: { ...MAN, resumo: `Correção ${n} da entrevista.`, corrigeManifestacaoId: alvo } })));
  ok(rs.every((x) => x.ok) && rs.filter((x) => x.r.sucesso).length === 1 && rs.filter((x) => !x.r.sucesso).every((x) => x.r.mudou || x.r.limite), "UMA correção vence; as outras ouvem que já foi corrigida", rs.map((x) => x.r));
  ok((await escalar("SELECT COUNT(*) FROM CriseManifestacoes WHERE CorrigeManifestacaoId = @a", { a: alvo })) === 1, "a corrente não bifurca no banco");

  console.log("== quatro primeiras respostas ao mesmo pedido da imprensa ==");
  const demandaId = (await q(`INSERT INTO CriseDemandasImprensa (CriseId, Veiculo, Contato, Pedido, RegistradoPorMembroId) VALUES (@c, N'TV Corrida', N'(91) 90000-0000', N'Pedido de entrevista.', 3001);
    SELECT CAST(SCOPE_IDENTITY() AS INT) AS id`, { c: criseId }))[0].id;
  rs = await disparar([1, 2, 3, 4].map((n) => ({ tipo: "responder", membroId: n % 2 ? 1002 : 1001, dados: { demandaId, situacao: "RESPONDIDA", resposta: `Resposta ${n} ao pedido.` } })));
  ok(rs.every((x) => x.ok) && rs.filter((x) => x.r.sucesso).length === 1 && rs.filter((x) => !x.r.sucesso).every((x) => x.r.mudou || x.r.limite), "UMA resposta entra; as outras ouvem que já foi respondido", rs.map((x) => x.r));
  ok((await escalar("SELECT COUNT(*) FROM CriseDemandaRespostas WHERE DemandaId = @d", { d: demandaId })) === 1, "uma linha de resposta");

  console.log("== o plano salvo por dois em cima da mesma versão; a mesma pessoa na equipe por quatro ==");
  const PLANO = { rotasEvacuacao: "Porta principal e lateral.", pontosEncontro: "Praça em frente.", responsaveis: "Diác. João", versaoAtual: 0 };
  rs = await disparar([1, 2].map((n) => ({ tipo: "plano", congregacaoId: c1, dados: { ...PLANO, pontosEncontro: `Ponto ${n} em frente.` } })));
  ok(rs.every((x) => x.ok) && rs.filter((x) => x.r.sucesso).length === 1, "UM plano vence; o outro ouve que mudou", rs.map((x) => x.r));
  ok((await escalar("SELECT COUNT(*) FROM SegurancaPlanos WHERE CongregacaoId = @c", { c: c1 })) === 1, "uma versão no banco");
  rs = await disparar([1, 2, 3, 4].map(() => ({ tipo: "equipe", congregacaoId: c1, dados: { membroId: 8011, funcao: "PORTARIA", desde: L.hojeBr() } })));
  ok(rs.every((x) => x.ok) && rs.filter((x) => x.r.sucesso).length === 1, "UMA entrada na equipe; as outras recusadas", rs.map((x) => x.r));
  ok((await escalar("SELECT COUNT(*) FROM SegurancaEquipe WHERE MembroId = 8011 AND Funcao = 'PORTARIA' AND EncerradoEm IS NULL")) === 1, "uma linha ativa");

  console.log("== trocar o porta-voz e encerrar ao mesmo tempo; depois quatro encerramentos ==");
  rs = await disparar([{ tipo: "porta-voz", criseId }, { tipo: "encerrar", criseId, n: 0 }]);
  ok(rs.every((x) => x.ok) && rs[1].r.sucesso, "o encerramento passa; a troca ou passou antes ou ouviu que a crise acabou", rs.map((x) => x.r));
  const eventos = (await q("SELECT Evento FROM CriseHistorico WHERE CriseId = @c ORDER BY HistoricoId", { c: criseId })).map((x) => x.Evento).join(",");
  ok(["ABERTA,ENCERRADA", "ABERTA,PORTA_VOZ,ENCERRADA"].includes(eventos) && (rs[0].r.sucesso ? eventos.includes("PORTA_VOZ") : !eventos.includes("PORTA_VOZ")), "o histórico fica numa ordem que existe (nunca troca de porta-voz depois do fim)", eventos);
  ok((await escalar("SELECT PortaVozNome FROM CriseHistorico WHERE CriseId = @c AND Evento = 'ENCERRADA'", { c: criseId })) === (await escalar("SELECT PortaVozNome FROM CriseRegimes WHERE CriseId = @c", { c: criseId })),
    "revisão: o porta-voz do histórico do fim é o do regime no fim (relido dentro da trava)");
  rs = await disparar([1, 2, 3, 4].map((n) => ({ tipo: "encerrar", criseId, n })));
  ok(rs.every((x) => x.ok && !x.r.sucesso && (x.r.mudou || x.r.limite)), "encerrar de novo, quatro ao mesmo tempo: todos ouvem que já foi encerrada", rs.map((x) => x.r));
  ok((await escalar("SELECT COUNT(*) FROM CriseHistorico WHERE CriseId = @c AND Evento = 'ENCERRADA'", { c: criseId })) === 1
    && (await escalar("SELECT COUNT(*) FROM ComunicacaoModelos WHERE Categoria = 'CRISE' AND Chave LIKE 'crise-%-fim-%'")) === 1, "um encerramento e um aviso de fim");

  console.log("== nenhum e-mail saiu duas vezes ==");
  const linhas = fs.readFileSync(arquivo, "utf8").split("\n").filter(Boolean);
  fs.unlinkSync(arquivo);
  ok(linhas.length > 0 && new Set(linhas).size === linhas.length, `${linhas.length} e-mails saíram nas rodadas das corridas, nenhum repetido`);
  ok((await escalar("SELECT COUNT(*) FROM ComunicacaoEntregas WHERE Situacao = 'ENVIANDO'")) === 0, "nada ficou preso em \"enviando\"");

  console.log("== revisão: 420 líderes com celular — o aviso sai NA HORA, em paralelo (não um a um, em horas) ==");
  // os canais de mentira deste processo: o celular demora 40 ms por aviso (a rede de verdade leva 0,2 a 0,4 s; o banco local já soma o resto)
  const pushesEscala = [];
  require(path.join(API, "shared/notificacaoPush.js")).enviarPushNotificacao = async (_p, _s, membroId) => { await new Promise((r) => setTimeout(r, 40)); pushesEscala.push(membroId); return 1; };
  require(path.join(API, "shared/notificacaoEmail.js")).enviarEmailComunicado = async () => ({ ok: true });
  const dbMain = require(path.join(API, "shared/criseSegurancaDb.js"));
  const pool = await L.obterPool();
  const papel = (await q("INSERT INTO Papeis (Nome, Nivel, Permissoes) VALUES (N'Liderança de Escala E2E', 'CONGREGACAO', ''); SELECT CAST(SCOPE_IDENTITY() AS INT) AS id"))[0].id;
  await q(`DECLARE @base INT = (SELECT ISNULL(MAX(MembroId), 0) FROM MembroReferencia);
    WITH n AS (SELECT TOP 420 ROW_NUMBER() OVER (ORDER BY (SELECT NULL)) AS i FROM sys.all_objects a CROSS JOIN sys.all_objects b)
    INSERT INTO MembroReferencia (MembroId, Nome, Status, CongregacaoId, DataNascimento, Email) SELECT @base + i, CONCAT(N'Líder Escala ', i, N' E2E'), 'ATIVO', @c, '1980-01-01', CONCAT('lider', i, '@e2e.invalid') FROM n;
    INSERT INTO Lideranca (MembroId, PapelId, EscopoTipo, EscopoId) SELECT m.MembroId, @p, 'CONGREGACAO', @c FROM MembroReferencia m WHERE m.Nome LIKE N'Líder Escala %';
    INSERT INTO PushInscricoesMembro (MembroId, Endpoint, P256dh, Auth) SELECT m.MembroId, CONCAT(N'https://push.e2e/escala/', m.MembroId), N'p', N'a' FROM MembroReferencia m WHERE m.Nome LIKE N'Líder Escala %';`, { c: c1, p: papel });
  const t0 = Date.now();
  const ab = await dbMain.abrir(pool, { ver: VER_SEC, dados: { motivo: "Crise de escala E2E", portaVoz: PV } });
  const seg = (Date.now() - t0) / 1000;
  ok(ab.sucesso, "a crise abre com mais de 420 líderes", ab.mensagem);
  const envioEscala = await escalar("SELECT EnvioId FROM CriseHistorico WHERE CriseId = @c AND Evento = 'ABERTA'", { c: ab.criseId });
  const comAparelho = await escalar("SELECT COUNT(*) FROM ComunicacaoEntregas WHERE EnvioId = @e AND Canal = 'PUSH' AND Situacao <> 'SEM_APARELHO'", { e: envioEscala });
  const aceitosNaHora = await escalar("SELECT COUNT(*) FROM ComunicacaoEntregas WHERE EnvioId = @e AND Canal = 'PUSH' AND Situacao = 'ACEITO'", { e: envioEscala });
  ok(comAparelho >= 420 && seg < 38, `a resposta da abertura voltou em ${seg.toFixed(1)} s (cabe no limite de ~45 s do serviço) com ${aceitosNaHora} de ${comAparelho} celulares avisados`);
  if (aceitosNaHora < comAparelho) await dbMain.continuarAviso(pool, { ver: VER_SEC });
  const aceitos = await escalar("SELECT COUNT(*) FROM ComunicacaoEntregas WHERE EnvioId = @e AND Canal = 'PUSH' AND Situacao = 'ACEITO'", { e: envioEscala });
  ok(aceitos === comAparelho && new Set(pushesEscala).size === pushesEscala.length, `revisão: TODOS os ${comAparelho} celulares avisados em no máximo duas rodadas (abertura ${aceitosNaHora}), nenhum repetido`, { aceitos, comAparelho });
  ok(/Celular: \d+ de \d+ aparelho/.test(ab.mensagem), "a resposta conta quantos celulares já foram avisados", ab.mensagem);
  ok((await dbMain.encerrar(pool, { ver: VER_SEC, criseId: ab.criseId, dados: { resumo: "Fim da escala." } })).sucesso, "a crise de escala é encerrada");

  fim("e2e-34 (corridas da crise)");
}

(process.argv[2] === "filho" ? filho() : principal()).catch((e) => { console.log("ERRO:", e && e.stack); L.shimEncerrar(); process.exitCode = 1; });
