// e2e-65-educacao-corridas.js — v8.6 (Educação continuada): corridas de verdade (N processos node, cada um com a sua conexão ao SQL Server) sobre a base "cenario-escada".
// Quatro edições da reciclagem do mesmo ano ao mesmo tempo: uma fica (as outras corrigem ou recebem 409). Quatro exames bienais do mesmo ano: um é criado (as outras: 409). Quatro
// lançamentos do resultado da mesma pessoa no mesmo exame: uma linha, sem nenhuma 500. Quatro retenções ao mesmo tempo: nenhuma quebra.
// Cada processo filho roda este mesmo arquivo com o primeiro argumento "filho".
process.env.AUTH_SECRET = "segredo-das-corridas-da-educacao-" + "x".repeat(24);
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
    if (spec.retencao) {
      const r = await require(path.join(L.API, "shared/educacaoContinuadaDb.js")).aplicarRetencao(pool);
      process.stdout.write("@@RESULTADO@@" + JSON.stringify({ ok: true, status: 200, apagadas: r.justificativasApagadas }) + "\n");
    } else {
      const res = await E.chamarRota("GestaoEducacaoContinuada/index.js", { metodo: "POST", binding: { acao: spec.acao }, token: L.GERAL(1002, ["afm", "pessoas"]), corpo: spec.corpo || {} });
      const b = res.body || {};
      process.stdout.write("@@RESULTADO@@" + JSON.stringify({ ok: true, status: res.status, sucesso: b.sucesso, mensagem: b.mensagem, resultados: b.resultados }) + "\n");
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
  await E.montarCenario();
  const ano = Number(hojeBr().slice(0, 4));

  console.log("== quatro edições do mesmo ano ==");
  let rs = await disparar([16, 18, 20, 22].map((h, i) => ({ acao: "edicao", corpo: { data: `${ano - 1}-08-${10 + i}`, cargaHoraria: h, frequenciaMinimaPct: 75 } })));
  ok(semErro(rs), "nenhum erro", rs);
  ok((await escalar("SELECT COUNT(*) FROM AFMReciclagemEdicoes WHERE Ano = @a", { a: ano - 1 })) === 1 && rs.some((r) => r.status === 200) && rs.every((r) => r.status === 200 || r.status === 409), "uma edição (as outras corrigem a mesma ou recebem 409 com aviso)", rs.map((r) => [r.status, r.mensagem]));

  console.log("== quatro exames bienais do mesmo ano ==");
  rs = await disparar([23, 24, 25, 26].map((d) => ({ acao: "exame", corpo: { tipo: "BIENAL", data: `${ano - 1}-11-${d}` } })));
  ok(semErro(rs), "nenhum erro", rs);
  ok((await escalar("SELECT COUNT(*) FROM AFMExames WHERE Tipo = 'BIENAL' AND YEAR(DataExame) = @a", { a: ano - 1 })) === 1, "um bienal no ano", rs.map((r) => [r.status, r.mensagem]));
  ok(rs.filter((r) => r.status === 201).length === 1 && rs.filter((r) => r.status === 409).length === 3, "uma 201 e três 409", rs.map((r) => r.status));

  console.log("== quatro lançamentos da mesma pessoa no mesmo exame ==");
  const exameId = await escalar("SELECT ExameId FROM AFMExames WHERE Tipo = 'BIENAL' AND YEAR(DataExame) = @a", { a: ano - 1 });
  rs = await disparar(["APROVADO", "REPROVADO", "AUSENTE", "APROVADO"].map((resultado) => ({ acao: "resultados-exame", corpo: { exameId, itens: [{ membroId: E.P.pastor1, resultado }] } })));
  ok(semErro(rs) && rs.every((r) => r.resultados && r.resultados[0].sucesso), "nenhuma 500 e todos gravam (o último vale)", rs);
  ok((await escalar("SELECT COUNT(*) FROM AFMExameResultados WHERE ExameId = @e AND MembroId = @m", { e: exameId, m: E.P.pastor1 })) === 1, "uma linha da pessoa no exame");
  const edicaoId = await escalar("SELECT EdicaoId FROM AFMReciclagemEdicoes WHERE Ano = @a", { a: ano - 1 });
  rs = await disparar([1, 2, 3, 4].map(() => ({ acao: "resultados-reciclagem", corpo: { edicaoId, itens: [{ membroId: E.P.pastor1, resultado: "AUSENTE" }, { membroId: E.P.pastor2, resultado: "REPROVADO", horasPresentes: 3 }] } })));
  ok(semErro(rs) && rs.every((r) => r.resultados && r.resultados.every((x) => x.sucesso)), "a reciclagem: nenhuma 500", rs);
  ok((await escalar("SELECT COUNT(*) FROM AFMReciclagemResultados WHERE EdicaoId = @e", { e: edicaoId })) === 2, "uma linha por pessoa");

  console.log("== quatro retenções ao mesmo tempo ==");
  const antigo = await escalar("INSERT INTO AFMExames (Tipo, DataExame) OUTPUT INSERTED.ExameId VALUES ('BIENAL', @d)", { d: `${ano - 3}-11-29` });
  for (const m of [E.P.pastor1, E.P.pastor2, E.P.pastor3, E.P.pastor4]) await q("INSERT INTO AFMExameResultados (ExameId, MembroId, Resultado, Justificativa) VALUES (@e, @m, 'AUSENTE_JUSTIFICADO', N'Viagem (e2e)')", { e: antigo, m });
  rs = await disparar([1, 2, 3, 4].map(() => ({ retencao: true })));
  ok(semErro(rs), "nenhuma retenção quebrou", rs);
  ok((await escalar("SELECT COUNT(*) FROM AFMExameResultados WHERE ExameId = @e AND Justificativa = N'Viagem (e2e)'", { e: antigo })) === 0 && rs.reduce((s, r) => s + (r.apagadas || 0), 0) === 4,
    "as quatro apagadas, cada uma uma vez só", rs.map((r) => r.apagadas));

  fim("e2e-65 educação continuada (corridas)");
}

if (process.argv[2] === "filho") filho();
else principal().catch((e) => { console.log("ERRO", e); process.exit(1); });
