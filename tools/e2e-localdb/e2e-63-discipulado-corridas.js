// e2e-63-discipulado-corridas.js — v8.5 (Trilha de discipulado): corridas de verdade (N processos node, cada um com a sua conexão ao SQL Server) sobre a base
// "cenario-escada". Quatro "conversão" da mesma pessoa (marco único) ao mesmo tempo: uma fica. Quatro rotinas diárias ao mesmo tempo: um item por pessoa (o índice único
// segura). Quatro etapas novas com a mesma chave: uma é criada. Quatro tipos de marco com o mesmo código: um, sem nenhuma 500.
// Cada processo filho roda este mesmo arquivo com o primeiro argumento "filho".
process.env.AUTH_SECRET = "segredo-das-corridas-do-discipulado-" + "x".repeat(24);
const { spawn } = require("child_process");
const L = require("./lib");
const { path } = L;

async function filho() {
  const spec = JSON.parse(process.argv[3]);
  const E = require("./lib-escada");
  const pool = await L.obterPool();
  const espera = spec.t0 - Date.now();
  if (espera > 0) await new Promise((r) => setTimeout(r, espera));
  try {
    if (spec.rotina) {
      const r = await require(path.join(L.API, "shared/discipuladoDb.js")).rotinaDiaria(pool);
      process.stdout.write("@@RESULTADO@@" + JSON.stringify({ ok: true, status: 200, abertos: r.abertos }) + "\n");
    } else {
      const token = spec.local ? L.LIDER(E.P.lider, ["pessoas"], [E.CENTRAL]) : L.GERAL(1002, ["pessoas"]);
      const res = await E.chamarRota(spec.rota, { metodo: "POST", binding: spec.acao ? { acao: spec.acao } : {}, token, corpo: spec.corpo || {} });
      const b = res.body || {};
      process.stdout.write("@@RESULTADO@@" + JSON.stringify({ ok: true, status: res.status, sucesso: b.sucesso, mensagem: b.mensagem }) + "\n");
    }
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
  const { ok, fim, q, escalar, hojeBr } = L;
  const E = require("./lib-escada");
  await L.obterPool();
  const { central } = await E.montarCenario();
  const somar = (n) => require(path.join(L.API, "shared/afm.js")).somarDias(hojeBr(), n);
  const pessoa = (m) => q(`IF NOT EXISTS (SELECT 1 FROM MembroReferencia WHERE MembroId = @m)
    INSERT INTO MembroReferencia (MembroId, Nome, CongregacaoId, Status, SituacaoMembro, DataNascimento, DataAdmissao) VALUES (@m, @n, @c, 'ATIVO', 'EM_COMUNHAO', '1990-01-01', '2020-01-01')`,
    { m, n: `Corrida ${m} E2E`, c: central });

  console.log("== quatro conversões da mesma pessoa ==");
  await pessoa(9601);
  let rs = await disparar(Array.from({ length: 4 }, () => ({ rota: "RegistrarMarcoMembro/index.js", local: true, corpo: { membroId: 9601, tipo: "CONVERSAO", descricao: "Corrida e2e", dataMarco: somar(-3) } })));
  ok(semErro(rs), "nenhum erro", rs);
  ok((await escalar("SELECT COUNT(*) FROM MarcosMembro WHERE MembroId = 9601 AND Tipo = 'CONVERSAO'")) === 1, "uma conversão gravada", rs.map((r) => r.status));
  ok(rs.filter((r) => r.status === 201).length === 1 && rs.filter((r) => r.status === 409).length === 3, "uma 201 e três 409", rs.map((r) => r.status));

  console.log("== quatro rotinas diárias ao mesmo tempo ==");
  for (let i = 0; i < 8; i++) { await pessoa(9610 + i); await q("INSERT INTO MarcosMembro (MembroId, Tipo, Descricao, DataMarco) VALUES (@m, 'CONVERSAO', N'e2e', @d)", { m: 9610 + i, d: somar(-i - 1) }); }
  rs = await disparar(Array.from({ length: 4 }, () => ({ rotina: true })));
  ok(semErro(rs), "nenhuma rotina quebrou", rs);
  const porPessoa = await q("SELECT MembroId, COUNT(*) AS n FROM CuidadoItens WHERE Tipo = 'DISCIPULADO' AND MembroId BETWEEN 9601 AND 9617 GROUP BY MembroId");
  ok(porPessoa.length === 9 && porPessoa.every((l) => l.n === 1), "um item por pessoa (nove pessoas, nenhum repetido)", porPessoa);
  ok(rs.reduce((s, r) => s + (r.abertos || 0), 0) === 9, "e a soma do que as quatro abriram é nove", rs);

  console.log("== quatro etapas novas com a mesma chave ==");
  rs = await disparar([1, 2, 3, 4].map((i) => ({ rota: "GestaoDiscipulado/index.js", acao: "etapa", corpo: { chave: "CORRIDA_E2E", nome: `Corrida ${i}`, ordem: 9, fonte: "BATISMO_AGUAS" } })));
  ok(semErro(rs), "nenhum erro", rs);
  ok((await escalar("SELECT COUNT(*) FROM EtapasDiscipulado WHERE Chave = 'CORRIDA_E2E'")) === 1 && rs.filter((r) => r.status === 201).length === 1, "uma etapa criada (as outras: 409)", rs.map((r) => [r.status, r.mensagem]));

  console.log("== quatro tipos de marco com o mesmo código ==");
  rs = await disparar([1, 2, 3, 4].map((i) => ({ rota: "GestaoDiscipulado/index.js", acao: "tipo-marco", corpo: { codigo: "CORRIDA_E2E", nome: `Corrida e2e ${i}` } })));
  ok(semErro(rs), "nenhuma 500", rs);
  ok((await escalar("SELECT COUNT(*) FROM TiposMarco WHERE Codigo = 'CORRIDA_E2E'")) === 1, "um tipo (os outros atualizam ou recebem 409)", rs.map((r) => [r.status, r.mensagem]));

  fim("e2e-63 discipulado (corridas)");
}

if (process.argv[2] === "filho") filho();
else principal().catch((e) => { console.log("ERRO", e); process.exit(1); });
