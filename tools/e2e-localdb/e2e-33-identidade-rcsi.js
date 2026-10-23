// e2e-33-identidade-rcsi.js — v7.14 (revisão adversarial de 23/10/2026): o banco com READ_COMMITTED_SNAPSHOT LIGADO, como o Azure SQL vem por padrão (o LocalDB vem
// desligado, e com ele desligado a leitura comum espera a gravação em curso — a corrida não aparece). Liga no começo e desliga no fim.
//   1) o voto em curso × o encerramento da enquete: com a leitura de versão, a contagem feita ANTES de fechar não via o voto que estava sendo gravado — ele entrava depois,
//      fora da conta (o resultado da vinculante saía errado). Prova determinística: este processo abre uma transação e grava um voto com o MESMO comando do handler
//      (SQL_INSERIR_RESPOSTA), sem confirmar; um processo filho encerra a enquete pela rota; só então o voto é confirmado. O resultado gravado tem de contar o voto.
//   2) "no máximo 3 sugestões por pessoa" e "o mesmo tema só uma vez" com a leitura de versão: a trava do ciclo (sp_getapplock) põe as gravações em fila.
// Cada processo filho roda este mesmo arquivo com o primeiro argumento "filho".
process.env.AUTH_SECRET = "segredo-das-corridas-rcsi-da-identidade-" + "x".repeat(24);
const { spawn } = require("child_process");
const L = require("./lib");
const { path, API, sql } = L;
const ENQ = require(path.join(API, "GestaoEnquetes/index.js"));
const H = require(path.join(API, "GestaoIdentidadeVisual/index.js"));
const db = require(path.join(API, "shared/identidadeVisualDb.js"));
// o comando do voto que o handler usa (o de antes da revisão não era exportado: é este, sem a trava na leitura da enquete)
const SQL_VOTO = ENQ.SQL_INSERIR_RESPOSTA || `INSERT INTO RespostasEnquete (PerguntaId, MembroId, OpcaoId, TextoResposta)
                  SELECT @perguntaId, @membroId, @opcaoId, @textoResposta
                  WHERE EXISTS (SELECT 1 FROM Enquetes WHERE EnqueteId = @enqueteId AND Status = 'ABERTA' AND (DataFechamentoPrevista IS NULL OR DataFechamentoPrevista > SYSUTCDATETIME()))`;

async function filho() {
  const spec = JSON.parse(process.argv[3]);
  if (spec.agora) { const a = new Date(spec.agora); db.usarRelogio(() => a); }
  await L.obterPool();
  const espera = spec.t0 - Date.now();
  if (espera > 0) await new Promise((r) => setTimeout(r, espera));
  let resultado;
  try {
    if (spec.tipo === "encerrar") {
      const ctx = { bindingData: { id: String(spec.enqueteId), acao: "encerrar" }, log: { error() { } } };
      await ENQ(ctx, { method: "POST", query: {}, body: {}, headers: { "x-auth-token": L.GERAL(1002, ["reunioes", "assembleia"]) } });
      resultado = { status: ctx.res.status, body: ctx.res.body };
    } else if (spec.tipo === "sugerir") {
      const r = await L.chamar(H, { acao: "sugerir", metodo: "POST", token: L.PIN(spec.membroId), corpo: { texto: spec.texto } });
      resultado = { status: r.status, mensagem: r.body && r.body.mensagem };
    }
    process.stdout.write("@@RESULTADO@@" + JSON.stringify({ ok: true, resultado }) + "\n");
  } catch (e) {
    process.stdout.write("@@RESULTADO@@" + JSON.stringify({ ok: false, erro: e && e.message }) + "\n");
  }
  L.shimEncerrar();
}
function lancar(spec) {
  return new Promise((resolve) => {
    const p = spawn(process.execPath, ["-r", path.join(__dirname, "shim-mssql.js"), __filename, "filho", JSON.stringify(spec)], { env: process.env });
    let saida = ""; p.stdout.on("data", (d) => { saida += d; });
    p.on("exit", () => { const m = saida.split("\n").find((l) => l.startsWith("@@RESULTADO@@")); resolve(m ? JSON.parse(m.slice(13)) : { ok: false, erro: "sem resultado" }); });
  });
}
async function disparar(specs) {
  const t0 = Date.now() + 6000 + specs.length * 700;
  return Promise.all(specs.map((spec) => lancar({ ...spec, t0 })));
}

async function principal() {
  const { ok, fim, q, escalar, um, obterPool } = L;
  const pool = await obterPool();
  await q("ALTER DATABASE CURRENT SET READ_COMMITTED_SNAPSHOT ON WITH ROLLBACK IMMEDIATE");
  try {
    ok((await escalar("SELECT CAST(is_read_committed_snapshot_on AS INT) FROM sys.databases WHERE name = DB_NAME()")) === 1, "o banco está com READ_COMMITTED_SNAPSHOT ligado (como o Azure SQL)");

    console.log("== o voto em curso × o encerramento da enquete vinculante ==");
    const e = (await q(`INSERT INTO Enquetes (Titulo, Visibilidade, PublicoTipo, Vinculante, QuorumTipo, Status, CriadoPor) VALUES (N'Corrida RCSI', 'SECRETA', 'TODOS_ATIVOS', 1, 'MAIORIA_SIMPLES', 'ABERTA', 1002);
      SELECT CAST(SCOPE_IDENTITY() AS INT) AS id`))[0].id;
    const p = (await q("INSERT INTO PerguntasEnquete (EnqueteId, Ordem, Titulo, Tipo) VALUES (@e, 1, N'Aprova?', 'OPCOES'); SELECT CAST(SCOPE_IDENTITY() AS INT) AS id", { e }))[0].id;
    const sim = (await q("INSERT INTO OpcoesEnquete (PerguntaId, Texto) VALUES (@p, N'Sim'); SELECT CAST(SCOPE_IDENTITY() AS INT) AS id", { p }))[0].id;
    const nao = (await q("INSERT INTO OpcoesEnquete (PerguntaId, Texto) VALUES (@p, N'Não'); SELECT CAST(SCOPE_IDENTITY() AS INT) AS id", { p }))[0].id;
    await q("INSERT INTO RespostasEnquete (PerguntaId, MembroId, OpcaoId) VALUES (@p, 2002, @s), (@p, 2003, @n)", { p, s: sim, n: nao });
    // 1 a 1 já gravado: empatado, NÃO aprovado. O voto em curso (Sim) faz 2 a 1: aprovado — se for contado.
    const t = new sql.Transaction(pool);
    await t.begin();
    const rq = new sql.Request(t);
    rq.input("enqueteId", sql.Int, e).input("perguntaId", sql.Int, p).input("membroId", sql.Int, 2001).input("opcaoId", sql.Int, sim).input("textoResposta", sql.NVarChar(500), null);
    const gravouNaTransacao = await rq.query(SQL_VOTO);
    ok(gravouNaTransacao.rowsAffected[0] === 1, "o voto foi gravado dentro da transação (ainda não confirmado)");
    const filhoEncerra = lancar({ tipo: "encerrar", enqueteId: e, t0: Date.now() });
    await new Promise((r) => setTimeout(r, 9000));                  // tempo do filho subir e chegar ao encerramento (com a correção, ele fica esperando o voto)
    await t.commit();
    const enc = await filhoEncerra;
    ok(enc.ok && enc.resultado.status === 200 && enc.resultado.body.sucesso === true, "o encerramento terminou", enc);
    const gravados = await escalar("SELECT COUNT(*) FROM RespostasEnquete WHERE PerguntaId = @p", { p });
    const fechada = await um("SELECT Status, CAST(ResultadoAprovado AS INT) AS r FROM Enquetes WHERE EnqueteId = @e", { e });
    ok(gravados === 3 && fechada.Status === "ENCERRADA" && fechada.r === 1,
      "o voto que estava sendo gravado ENTROU na contagem: 2 a 1, aprovado (antes: contado 1 a 1 e 'Não aprovado', com 3 votos gravados)", { gravados, fechada, resposta: enc.resultado.body });
    const depois = await q(`${SQL_VOTO}; SELECT @@ROWCOUNT AS n`, { enqueteId: e, perguntaId: p, membroId: 2004, opcaoId: sim, textoResposta: "" });
    ok(Number(depois[0].n) === 0 && (await escalar("SELECT COUNT(*) FROM RespostasEnquete WHERE PerguntaId = @p", { p })) === 3, "depois de encerrada, nenhum voto entra");

    console.log("== no máximo 3 sugestões e o tema único, com a leitura de versão ==");
    await q(`INSERT INTO MembroReferencia (MembroId, Nome, CongregacaoId, Status, SituacaoMembro, DataNascimento)
      SELECT 9200 + n, CONCAT(N'RCSI ', n, N' E2E'), (SELECT TOP 1 CongregacaoId FROM Congregacoes WHERE Nome = N'Central E2E'), 'ATIVO', 'EM_COMUNHAO', '1985-01-01'
      FROM (SELECT TOP 10 ROW_NUMBER() OVER (ORDER BY (SELECT NULL)) - 1 AS n FROM sys.all_objects) x WHERE NOT EXISTS (SELECT 1 FROM MembroReferencia WHERE MembroId = 9200 + n)`);
    db.usarRelogio(() => new Date("2027-10-20T12:00:00Z"));
    const ciclo = await db.abrirCiclo(pool, { ver: { membroId: 1002 }, anoAlvo: 2028 });
    const C = ciclo.cicloId || (await escalar("SELECT CicloId FROM IdentidadeCiclos WHERE AnoAlvo = 2028"));
    const NOV05 = "2027-11-05T12:00:00Z";
    let rs = await disparar(Array.from({ length: 6 }, (_, i) => ({ tipo: "sugerir", membroId: 9200, texto: `Tema RCSI número ${i + 1}`, agora: NOV05 })));
    ok(rs.every((r) => r.ok && [201, 422, 429].includes(r.resultado.status)), "seis sugestões da mesma pessoa: terminam sem erro", rs.map((r) => r.resultado || r.erro));
    ok((await escalar("SELECT COUNT(*) FROM IdentidadeSugestoes WHERE CicloId = @c AND MembroId = 9200 AND Status <> 'RETIRADA'", { c: C })) === 3, "entram exatamente 3 (a trava do ciclo cobre a leitura de versão)");
    rs = await disparar(Array.from({ length: 6 }, (_, i) => ({ tipo: "sugerir", membroId: 9201 + i, texto: "Tema único com leitura de versão", agora: NOV05 })));
    ok(rs.every((r) => r.ok && [201, 422, 429].includes(r.resultado.status)) && rs.filter((r) => r.resultado.status === 201).length === 1
      && (await escalar("SELECT COUNT(*) FROM IdentidadeSugestoes WHERE CicloId = @c AND TextoNormalizado = N'tema unico com leitura de versao'", { c: C })) === 1, "o mesmo tema de seis pessoas: entra 1", rs.map((r) => r.resultado));
  } finally {
    await q("ALTER DATABASE CURRENT SET READ_COMMITTED_SNAPSHOT OFF WITH ROLLBACK IMMEDIATE");
  }
  ok((await escalar("SELECT CAST(is_read_committed_snapshot_on AS INT) FROM sys.databases WHERE name = DB_NAME()")) === 0, "e o banco volta ao normal no fim");
  fim("e2e-33 (identidade visual e enquetes com READ_COMMITTED_SNAPSHOT)");
}

(process.argv[2] === "filho" ? filho() : principal()).catch((e) => { console.log("ERRO:", e && e.stack); try { L.q("ALTER DATABASE CURRENT SET READ_COMMITTED_SNAPSHOT OFF WITH ROLLBACK IMMEDIATE").finally(() => L.shimEncerrar()); } catch { L.shimEncerrar(); } process.exitCode = 1; });
