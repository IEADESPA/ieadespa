// e2e-49-afm-corridas.js — v8.1 (AFM e faltas da CLI): corridas de verdade (N processos node, cada um com a sua conexão ao SQL Server) sobre a base "cenario-afm".
// Seis apurações ao mesmo tempo sobre as mesmas 3 faltas: uma exclusão por pessoa; quatro justificativas e duas apurações juntas: a exclusão é anulada uma vez e não volta;
// quatro reprovações da mesma pessoa: uma desmatrícula; quatro rematrículas: uma; quatro readmissões da mesma exclusão: uma; quatro nomeações de Reitor: no fim, um só aberto
// e o resto encerrado em ordem; quatro mestres na CDER ao mesmo tempo: no máximo 2; quatro rodadas da matrícula automática: uma matrícula para o oficial novo.
// Cada processo filho roda este mesmo arquivo com o primeiro argumento "filho".
process.env.AUTH_SECRET = "segredo-das-corridas-da-afm-" + "x".repeat(24);
const { spawn } = require("child_process");
const L = require("./lib");
const { path, API } = L;
const SEC_PERM = ["reunioes", "assembleia", "cli", "pessoas", "afm", "consagracoes"];

async function filho() {
  const spec = JSON.parse(process.argv[3]);
  const { chamarRota } = require("./lib-afm");
  const db = require(path.join(API, "shared/afmDb.js"));
  const pool = await L.obterPool();
  const espera = spec.t0 - Date.now();
  if (espera > 0) await new Promise((r) => setTimeout(r, espera));
  const SEC = L.GERAL(1002, SEC_PERM);
  let r;
  try {
    if (spec.tipo === "apurar") r = await db.apurar(pool, {});
    else if (spec.tipo === "garantir") r = { sucesso: true, criadas: await db.garantirMatriculas(pool) };
    else if (spec.tipo === "justificar") r = (await chamarRota("JustificarFalta/index.js", { metodo: "POST", binding: { sessaoId: spec.sessaoId }, token: SEC, corpo: { membroId: spec.membroId, codigo: "SAUDE" } })).body;
    else {
      const res = await chamarRota(spec.tipo === "cder" ? "GestaoComissoes/index.js" : "GestaoAFM/index.js",
        { metodo: "POST", binding: spec.tipo === "cder" ? { sigla: "cder" } : { acao: spec.tipo }, token: SEC, corpo: spec.corpo });
      r = { ...(res.body || {}), status: res.status };
    }
    process.stdout.write("@@RESULTADO@@" + JSON.stringify({ ok: true, r: { sucesso: r.sucesso, mudou: !!r.mudou, status: r.status, mensagem: r.mensagem, exclusoes: r.exclusoes && r.exclusoes.length } }) + "\n");
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

async function principal() {
  const { ok, fim, q, escalar, hojeBr } = L;
  const { P, montarCenario } = require("./lib-afm");
  await L.obterPool();
  const hoje = hojeBr();
  const { orgaoCLI } = await montarCenario();
  // 3 ordinárias já ENCERRADAS com as faltas gravadas direto no banco, SEM a apuração (é ela que vai correr)
  const S = [];
  for (let i = 1; i <= 3; i++) {
    const s = await escalar(`INSERT INTO Sessoes (OrgaoId, Descricao, DataSessao, Status, TipoSessao, ContaFaltasCLI) OUTPUT INSERTED.SessaoId
      VALUES (@o, @d, CAST(SYSUTCDATETIME() AS DATE), 'ENCERRADA', 'ORDINARIA', 1)`, { o: orgaoCLI, d: `Corrida ${i}` });
    S.push(s);
    for (const id of [P.faltoso, P.fiscal]) await q("INSERT INTO Presencas (SessaoId, MembroId, Presente, FaltaJustificada, EsperadoCLI, EsperadoAFM) VALUES (@s, @m, 0, 0, 1, 0)", { s, m: id });
  }

  console.log("== seis apurações ao mesmo tempo ==");
  let rs = await disparar([1, 2, 3, 4, 5, 6].map(() => ({ tipo: "apurar" })));
  ok(rs.every((x) => x.ok), "as seis terminam sem erro", rs.filter((x) => !x.ok));
  ok((await escalar("SELECT COUNT(*) FROM CLIExclusoesFaltas WHERE MembroId = @m", { m: P.faltoso })) === 1 && (await escalar("SELECT COUNT(*) FROM CLIExclusoesFaltas WHERE MembroId = @m", { m: P.fiscal })) === 1,
    "uma exclusão por pessoa (nenhuma repetida)");
  ok(rs.reduce((n, x) => n + ((x.r && x.r.exclusoes) || 0), 0) === 2, "somando as seis, só 2 exclusões foram gravadas", rs.map((x) => x.r && x.r.exclusoes));

  console.log("== quatro justificativas da mesma falta e duas apurações juntas ==");
  rs = await disparar([...[1, 2, 3, 4].map(() => ({ tipo: "justificar", sessaoId: S[1], membroId: P.faltoso })), { tipo: "apurar" }, { tipo: "apurar" }]);
  ok(rs.every((x) => x.ok), "todos terminam sem erro", rs.filter((x) => !x.ok));
  ok((await escalar("SELECT COUNT(*) FROM CLIExclusoesFaltas WHERE MembroId = @m AND AnuladaEm IS NOT NULL", { m: P.faltoso })) === 1
    && (await escalar("SELECT COUNT(*) FROM CLIExclusoesFaltas WHERE MembroId = @m AND AnuladaEm IS NULL AND ReadmitidaEm IS NULL", { m: P.faltoso })) === 0, "a exclusão é anulada uma vez e não volta");

  console.log("== quatro readmissões da mesma exclusão ==");
  const exF = await escalar("SELECT ExclusaoId FROM CLIExclusoesFaltas WHERE MembroId = @m AND AnuladaEm IS NULL AND ReadmitidaEm IS NULL", { m: P.fiscal });
  rs = await disparar([1, 2, 3, 4].map((n) => ({ tipo: "readmitir", corpo: { exclusaoId: exF, data: hoje, ato: `Ata da CLI ${n}/2026` } })));
  ok(rs.every((x) => x.ok && x.r.status !== 500), "sem erro", rs.map((x) => x.r || x.erro));
  ok(rs.filter((x) => x.r.sucesso).length === 1 && (await escalar("SELECT COUNT(*) FROM CLIExclusoesFaltas WHERE ExclusaoId = @e AND ReadmitidaEm IS NOT NULL", { e: exF })) === 1, "uma readmissão vale; as outras ouvem que já não está vigente");

  console.log("== quatro reprovações e quatro rematrículas da mesma pessoa ==");
  rs = await disparar([1, 2, 3, 4].map(() => ({ tipo: "reprovar", corpo: { membroId: P.auxiliar, data: hoje, detalhe: "Prova de doutrina de outubro" } })));
  ok(rs.every((x) => x.ok && x.r.status !== 500), "sem erro", rs.map((x) => x.r || x.erro));
  ok(rs.filter((x) => x.r.sucesso).length === 1 && (await escalar("SELECT COUNT(*) FROM AFMDesmatriculas WHERE MembroId = @m", { m: P.auxiliar })) === 1, "uma desmatrícula");
  rs = await disparar([1, 2, 3, 4].map(() => ({ tipo: "rematricular", corpo: { membroId: P.auxiliar, reciclagemAprovadaEm: hoje } })));
  ok(rs.every((x) => x.ok && x.r.status !== 500), "sem erro", rs.map((x) => x.r || x.erro));
  ok(rs.filter((x) => x.r.sucesso).length === 1 && (await escalar("SELECT COUNT(*) FROM Matriculas_AFM WHERE MembroId = @m AND Origem = 'REMATRICULA'", { m: P.auxiliar })) === 1, "uma rematrícula");
  ok((await escalar("SELECT TOP 1 StatusMatricula FROM Matriculas_AFM WHERE MembroId = @m ORDER BY MatriculaId DESC", { m: P.auxiliar })) === "ATIVA", "e a matrícula atual está ativa");

  console.log("== quatro nomeações de Reitor ao mesmo tempo ==");
  rs = await disparar([P.reitor, P.presente, P.mestre, P.tesoureiro].map((m) => ({ tipo: "nomear-reitor", corpo: { membroId: m, dataInicio: hoje } })));
  ok(rs.every((x) => x.ok && x.r.status !== 500), "sem erro", rs.map((x) => x.r || x.erro));
  ok((await escalar("SELECT COUNT(*) FROM AFMCorpoDocente WHERE Papel = 'REITOR' AND DataFim IS NULL")) === 1, "no fim, um Reitor só");
  const sucessos = rs.filter((x) => x.r.sucesso).length;
  ok((await escalar("SELECT COUNT(*) FROM AFMCorpoDocente WHERE Papel = 'REITOR'")) === sucessos && (await escalar("SELECT COUNT(*) FROM AFMCorpoDocente WHERE Papel = 'REITOR' AND DataFim IS NOT NULL")) === sucessos - 1,
    "cada nomeação que valeu encerrou a anterior (nenhuma linha solta)", { sucessos });

  console.log("== quatro mestres na CDER ao mesmo tempo ==");
  rs = await disparar([P.mestre, P.tesoureiro, P.dupla, P.reprovado].map((m) => ({ tipo: "cder", corpo: { membroId: m, qualificacao: "Mestre em Teologia" } })));
  ok(rs.every((x) => x.ok && x.r.status !== 500), "sem erro", rs.map((x) => x.r || x.erro));
  const cder = await escalar("SELECT COUNT(*) FROM ComissaoMembros WHERE Sigla = 'CDER' AND DataFim IS NULL");
  ok(cder <= 2, "no máximo 2 mestres na CDER", cder);

  console.log("== quatro rodadas da matrícula automática ==");
  const c1 = await escalar("SELECT CongregacaoId FROM Congregacoes WHERE Nome = N'Central E2E'");
  await q("INSERT INTO MembroReferencia (MembroId, Nome, CongregacaoId, Status, SituacaoMembro, DataNascimento, CargoMinisterial) VALUES (9190, N'Auxiliar Novo E2E', @c, 'ATIVO', 'EM_COMUNHAO', '1990-01-01', 'AUXILIAR')", { c: c1 });
  rs = await disparar([1, 2, 3, 4].map(() => ({ tipo: "garantir" })));
  ok(rs.every((x) => x.ok), "sem erro", rs.filter((x) => !x.ok));
  ok((await escalar("SELECT COUNT(*) FROM Matriculas_AFM WHERE MembroId = 9190")) === 1, "uma matrícula para o oficial novo");

  fim("e2e-49 (AFM e faltas da CLI — corridas)");
}

if (process.argv[2] === "filho") filho().catch((e) => { process.stdout.write("@@RESULTADO@@" + JSON.stringify({ ok: false, erro: e && e.message }) + "\n"); L.shimEncerrar(); });
else principal().catch((e) => { console.log("ERRO FATAL:", e && e.stack); L.shimEncerrar(); process.exitCode = 1; });
