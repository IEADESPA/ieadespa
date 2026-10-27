// e2e-42-trava7c-corridas.js — Trava de Revisão 7-C (BAIXO 17): os tetos do dia contados DENTRO da trava, com corridas de verdade (N processos node, cada um com a sua
// conexão ao SQL Server) sobre a base "cenario-7c". Antes, a contagem era feita fora da trava: pedidos ao mesmo tempo passavam todos pela contagem e o teto estourava.
//   - o pedido de visita (3 por pessoa em 24 horas): com 2 já feitos, 6 pedidos ao mesmo tempo (visita e pós-internação) — no fim, nunca mais que 3;
//   - o pedido da imprensa registrado por um líder (30 em 24 horas): com 28 já registrados, 8 ao mesmo tempo — no fim, nunca mais que 30.
const { spawn } = require("child_process");
const L = require("./lib");
const { ok, fim, q, escalar, obterPool, path } = L;

async function disparar(chamadas) {
  const t0 = Date.now() + 6000 + chamadas.length * 700;
  const procs = chamadas.map((spec) => new Promise((resolve) => {
    const p = spawn(process.execPath, ["-r", path.join(__dirname, "shim-mssql.js"), path.join(__dirname, "worker.js"), JSON.stringify({ ...spec, t0 })], { env: process.env });
    let saida = ""; p.stdout.on("data", (d) => { saida += d; });
    p.on("exit", () => { const m = saida.split("\n").find((l) => l.startsWith("@@RESULTADO@@")); resolve(m ? JSON.parse(m.slice(13)) : { status: -1, erro: "sem resultado" }); });
  }));
  return Promise.all(procs);
}
const fn = (modulo, nome, arg) => ({ funcao: { modulo, nome, args: [arg] } });
const semErro = (rs) => rs.every((x) => x.status === 200 && !x.erro);

(async () => {
  await obterPool();
  const c1 = await escalar("SELECT CongregacaoId FROM Congregacoes WHERE Nome = N'Central E2E'");

  console.log("== o teto do pedido de visita (3 em 24 horas) com 6 pedidos ao mesmo tempo ==");
  const quem = 8018;                 // Íris, adulta da Central
  for (let i = 0; i < 2; i++) {
    await q(`INSERT INTO CuidadoItens (Tipo, CongregacaoId, MembroId, Motivo, Origem, PrazoEm, Nivel, CriadoPorMembroId, Status, Desfecho, EncerradoEm)
      VALUES ('PEDIDO_VISITA', @c, @m, N'visita anterior', 'PEDIDO_MEMBRO', DATEADD(DAY, 2, SYSUTCDATETIME()), 'CONGREGACAO', @m, 'CONCLUIDO', 'ACOMPANHADO', SYSUTCDATETIME())`, { c: c1, m: quem });
  }
  let rs = await disparar(Array.from({ length: 6 }, (_, i) => fn("cuidadoPastoralDb", "pedirVisita", { membroId: quem, dados: { motivo: `pedido de visita da corrida ${i}`, hospital: i % 2 === 1 } })));
  ok(semErro(rs), "as 6 chamadas terminam sem erro", rs);
  const n = await escalar("SELECT COUNT(*) FROM CuidadoItens WHERE MembroId = @m AND Origem = 'PEDIDO_MEMBRO' AND CriadoEm >= DATEADD(HOUR, -24, SYSUTCDATETIME())", { m: quem });
  ok(n === 3, "no fim, exatamente 3 pedidos de visita em 24 horas (o teto); antes, a visita e a pós-internação passavam juntas pela contagem", n);
  ok(rs.filter((x) => x.resultado && x.resultado.limite).length >= 1, "os que passaram do teto recebem a recusa do limite", rs.map((x) => x.resultado && (x.resultado.limite ? "limite" : x.resultado.sucesso ? "ok" : x.resultado.mensagem)));

  console.log("== o teto do pedido da imprensa (30 em 24 horas) com 8 registros ao mesmo tempo ==");
  const lider = 3002;
  await q(`DECLARE @i INT = 0; WHILE @i < 28 BEGIN INSERT INTO CriseDemandasImprensa (CriseId, Veiculo, Contato, Pedido, RegistradoPorMembroId) VALUES (NULL, N'Veículo antigo', N'(91) 9 2222-0000', N'pedido anterior', @m); SET @i = @i + 1; END`, { m: lider });
  rs = await disparar(Array.from({ length: 8 }, (_, i) => fn("criseSegurancaDb", "registrarDemanda", { ver: { membroId: lider, crise: false }, dados: { veiculo: `Rádio ${i} E2E`, contato: "(91) 9 1111-0000", pedido: `Pedido da corrida ${i}.` } })));
  ok(semErro(rs), "as 8 chamadas terminam sem erro", rs);
  const d = await escalar("SELECT COUNT(*) FROM CriseDemandasImprensa WHERE RegistradoPorMembroId = @m AND RecebidaEm >= DATEADD(HOUR, -24, SYSUTCDATETIME())", { m: lider });
  ok(d === 30, "no fim, exatamente 30 pedidos em 24 horas (o teto)", d);
  ok(rs.filter((x) => x.resultado && x.resultado.sucesso).length === 2, "só 2 dos 8 passaram", rs.map((x) => x.resultado && x.resultado.sucesso));

  fim("e2e-42 (Trava 7-C: os tetos do dia dentro da trava, com corridas)");
})().catch((e) => { console.log("ERRO:", e && e.stack); L.shimEncerrar(); process.exitCode = 1; });
