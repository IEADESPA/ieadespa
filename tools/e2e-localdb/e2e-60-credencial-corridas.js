// e2e-60-credencial-corridas.js — v8.4 (Credencial digital): corridas de verdade (N processos node, cada um com a sua conexão ao SQL Server) sobre a base
// "cenario-escada". Quatro "emitir" da mesma pessoa: uma credencial; quatro "nova via": uma válida no fim, vias seguidas, sem repetir; "emitir" × "cancelar" × "nova
// via" ao mesmo tempo: uma válida ou nenhuma, nunca duas; dois lotes ao mesmo tempo: cada pessoa com uma só.
// Cada processo filho roda este mesmo arquivo com o primeiro argumento "filho".
process.env.AUTH_SECRET = "segredo-das-corridas-da-credencial-" + "x".repeat(24);
const { spawn } = require("child_process");
const L = require("./lib");
const { path } = L;

async function filho() {
  const spec = JSON.parse(process.argv[3]);
  const E = require("./lib-escada");
  await L.obterPool();
  const espera = spec.t0 - Date.now();
  if (espera > 0) await new Promise((r) => setTimeout(r, espera));
  let res;
  try {
    res = await E.chamarRota("GestaoCredenciais/index.js", { metodo: "POST", binding: { acao: spec.acao }, token: E.SEC(), corpo: spec.corpo || {} });
    const b = res.body || {};
    process.stdout.write("@@RESULTADO@@" + JSON.stringify({ ok: true, status: res.status, sucesso: b.sucesso, mensagem: b.mensagem }) + "\n");
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
const semErro = (rs) => rs.every((x) => x.ok && x.status && x.status < 500);

async function principal() {
  const { ok, fim, q, escalar } = L;
  const E = require("./lib-escada");
  const { P } = E;
  await L.obterPool();
  await E.montarCenario();
  const validas = (m) => escalar("SELECT COUNT(*) FROM CredenciaisEclesiasticas WHERE MembroId = @m AND Situacao = 'VALIDA'", { m });

  console.log("== quatro 'emitir' da mesma pessoa ==");
  let rs = await disparar(Array.from({ length: 4 }, () => ({ acao: "emitir", corpo: { membroId: P.auxiliar } })));
  ok(semErro(rs), "nenhum erro", rs);
  ok(rs.filter((x) => x.sucesso === true).length === 1 && (await validas(P.auxiliar)) === 1, "uma credencial", rs.map((x) => [x.status, x.sucesso]));

  console.log("== quatro 'nova via' ==");
  rs = await disparar(Array.from({ length: 4 }, (_, i) => ({ acao: "nova-via", corpo: { membroId: P.auxiliar, motivo: `Perda ${i} (corrida)` } })));
  ok(semErro(rs), "nenhum erro", rs);
  const vias = (await q("SELECT Via FROM CredenciaisEclesiasticas WHERE MembroId = @m ORDER BY Via", { m: P.auxiliar })).map((l) => l.Via);
  ok((await validas(P.auxiliar)) === 1 && vias.join() === vias.map((_, i) => i + 1).join() && vias.length === 1 + rs.filter((x) => x.sucesso === true).length, "uma válida no fim; vias seguidas, sem repetir", { vias, rs: rs.map((x) => [x.status, x.sucesso]) });

  console.log("== emitir × cancelar × nova via ==");
  rs = await disparar([
    { acao: "cancelar", corpo: { membroId: P.auxiliar, motivo: "Cancelada na corrida" } },
    { acao: "emitir", corpo: { membroId: P.auxiliar } },
    { acao: "nova-via", corpo: { membroId: P.auxiliar, motivo: "Nova na corrida" } },
    { acao: "emitir", corpo: { membroId: P.auxiliar } }
  ]);
  ok(semErro(rs), "nenhum erro", rs);
  ok((await validas(P.auxiliar)) <= 1, "nunca duas válidas", await validas(P.auxiliar));

  console.log("== dois lotes ao mesmo tempo ==");
  rs = await disparar([{ acao: "lote" }, { acao: "lote" }]);
  ok(semErro(rs), "nenhum erro", rs);
  ok((await escalar("SELECT COUNT(*) FROM (SELECT MembroId FROM CredenciaisEclesiasticas WHERE Situacao = 'VALIDA' GROUP BY MembroId HAVING COUNT(*) > 1) x")) === 0, "ninguém com duas válidas");
  ok((await escalar(`SELECT COUNT(*) FROM MembroReferencia m WHERE m.Status = 'ATIVO' AND (m.SituacaoMembro = 'EM_COMUNHAO' OR m.SituacaoMembro IS NULL)
                     AND NOT EXISTS (SELECT 1 FROM CredenciaisEclesiasticas c WHERE c.MembroId = m.MembroId AND c.Situacao = 'VALIDA')`)) === 0 || rs.some((x) => /Faltam/.test(x.mensagem || "")), "e todos os ativos com uma (ou o lote diz quantos faltam)");

  fim("e2e-60 credencial (corridas)");
}

if (process.argv[2] === "filho") filho();
else principal().catch((e) => { console.log("ERRO", e); process.exit(1); });
