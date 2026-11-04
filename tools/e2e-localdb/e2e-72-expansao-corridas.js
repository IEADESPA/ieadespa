// e2e-72-expansao-corridas.js — v9.2 (Expansão): corridas de verdade (N processos node, cada um com a sua conexão ao SQL Server) sobre a base "cenario-expansao".
// Quatro decisões do mesmo pedido; a decisão junto com a desistência; quatro pedidos de emancipação da mesma Extensão; duas aberturas homônimas aprovadas ao mesmo
// tempo; duas congregações novas homônimas; quatro trocas de Encarregado; quatro pareceres; a emancipação junto com a troca do Encarregado.
// Cada processo filho roda este mesmo arquivo com o primeiro argumento "filho".
process.env.AUTH_SECRET = "segredo-das-corridas-da-expansao-" + "x".repeat(24);
const { spawn } = require("child_process");
const L = require("./lib");
const { path } = L;

const TOKENS = {
  SEC: () => L.GERAL(1002, ["expansao"]),
  DIR: () => L.LIDER(3001, ["expansao"], ["Central E2E"]),
  PASTOR: () => L.LIDER(3003, ["expansao"], ["Central E2E", "Vila Nova E2E"], "AREA"),
  MISS: () => L.sessao(9401, { via: "SENHA", fator: { via: "CHAVE", em: Date.now() }, nivel: "DEPARTAMENTO", escopoCongregacoes: "TODAS", permissoes: ["expansao"] })
};

async function filho() {
  const spec = JSON.parse(process.argv[3]);
  const { chamarRota } = require("./lib-afm");
  await L.obterPool();
  const espera = spec.t0 - Date.now();
  if (espera > 0) await new Promise((r) => setTimeout(r, espera));
  try {
    const res = await chamarRota("GestaoExpansao/index.js", { metodo: "POST", binding: { acao: spec.acao }, token: TOKENS[spec.quem || "SEC"](), corpo: spec.corpo || {} });
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
const ganhos = (rs) => rs.filter((x) => x.sucesso === true).length;

async function principal() {
  const { ok, fim, q, escalar, hojeBr } = L;
  await L.obterPool();
  if (process.env.E2E_RCSI === "1") {
    await q("ALTER DATABASE CURRENT SET READ_COMMITTED_SNAPSHOT ON WITH ROLLBACK IMMEDIATE");
    ok((await escalar("SELECT CAST(is_read_committed_snapshot_on AS INT) FROM sys.databases WHERE name = DB_NAME()")) === 1, "READ_COMMITTED_SNAPSHOT ligado (como o Azure SQL)");
  }
  const central = await escalar("SELECT CongregacaoId FROM Congregacoes WHERE Nome = N'Central E2E'");
  const semiadespa = await escalar("SELECT DepartamentoId FROM Departamentos WHERE Sigla = 'SEMIADESPA'");
  for (let m = 9401; m <= 9410; m++) {
    await q(`INSERT INTO MembroReferencia (MembroId, Nome, CongregacaoId, Status, SituacaoMembro, DataNascimento, DataAdmissao) VALUES (@m, @n, @c, 'ATIVO', 'EM_COMUNHAO', '1980-01-01', '2010-01-01')`,
      { m, n: `Pessoa Corrida Exp ${m} E2E`, c: central });
  }
  await q("INSERT INTO Lideranca (MembroId, PapelId, EscopoTipo, EscopoId) SELECT 9401, PapelId, 'DEPARTAMENTO', @d FROM Papeis WHERE Nome = N'Secretário de Missões'", { d: semiadespa });
  const cli = await escalar(`INSERT INTO Sessoes (OrgaoId, Descricao, DataSessao, TipoSessao, Status) OUTPUT INSERTED.SessaoId SELECT OrgaoId, N'CLI corridas expansão', @d, 'EXTRAORDINARIA', 'ENCERRADA' FROM Orgaos WHERE Sigla = 'CLI'`, { d: hojeBr() });
  const db = require(path.join(L.API, "shared/expansaoDb.js"));
  const pool = await L.obterPool();
  const GERAL = { geral: true, cme: false, cobreMae: () => true };
  const pedir = async (dados, por = 3001) => {
    const r = await db.criarPedido(pool, { dados: { justificativa: "Justificativa das corridas da expansão.", ...dados }, por, hoje: hojeBr(), alcance: GERAL });
    if (!r.sucesso) throw new Error("pedido não criado: " + r.mensagem);
    return r.pedidoId;
  };
  const abertura = (nome, enc = 9402) => pedir({ tipo: "ABERTURA_EXTENSAO", congregacaoMaeId: central, encarregadoMembroId: enc, nome });

  console.log("== quatro decisões do mesmo pedido ==");
  const p1 = await abertura("Tenda Corrida Um E2E");
  let rs = await disparar([1, 2, 3, 4].map(() => ({ acao: "decidir", corpo: { pedidoId: p1, sessaoId: cli, resultado: "APROVADO" } })));
  ok(semErro(rs), "nenhum erro 500", rs.filter((x) => !(x.ok && x.status < 500)).map((x) => JSON.stringify(x)));
  ok(ganhos(rs) === 1, "uma decisão só passou", rs.map((x) => x.mensagem));
  ok(await escalar("SELECT COUNT(*) FROM ExtensoesTenda WHERE Nome = N'Tenda Corrida Um E2E'") === 1, "uma Extensão só");
  const ext1 = await escalar("SELECT ExtensaoId FROM ExtensoesTenda WHERE Nome = N'Tenda Corrida Um E2E'");
  ok(await escalar("SELECT COUNT(*) FROM ExtensaoEncarregados WHERE ExtensaoId = @e", { e: ext1 }) === 1, "um Encarregado só");

  console.log("== a decisão junto com a desistência ==");
  const p2 = await abertura("Tenda Corrida Dois E2E");
  rs = await disparar([{ acao: "decidir", corpo: { pedidoId: p2, sessaoId: cli, resultado: "APROVADO" } }, { acao: "desistir", quem: "DIR", corpo: { pedidoId: p2, motivo: "Desistência na corrida." } },
    { acao: "decidir", corpo: { pedidoId: p2, sessaoId: cli, resultado: "APROVADO" } }, { acao: "desistir", quem: "DIR", corpo: { pedidoId: p2, motivo: "Desistência na corrida." } }]);
  ok(semErro(rs) && ganhos(rs) === 1, "uma das quatro passou", rs.map((x) => `${x.status} ${x.mensagem}`));
  const st2 = await escalar("SELECT Status FROM PedidosExpansao WHERE PedidoId = @id", { id: p2 });
  const ext2 = await escalar("SELECT COUNT(*) FROM ExtensoesTenda WHERE Nome = N'Tenda Corrida Dois E2E'");
  ok((st2 === "APROVADO" && ext2 === 1) || (st2 === "DESISTIDO" && ext2 === 0), "o pedido e a Extensão contam a mesma história", [st2, ext2]);

  console.log("== quatro pedidos de emancipação da mesma Extensão ==");
  rs = await disparar([1, 2, 3, 4].map((i) => ({ acao: "pedido", quem: "DIR", corpo: { tipo: "EMANCIPACAO", extensaoId: ext1, nome: `Congregação Corrida ${i} E2E`, justificativa: "Justificativa das corridas da expansão." } })));
  ok(semErro(rs) && ganhos(rs) === 1, "um pedido só entrou", rs.map((x) => `${x.status} ${x.mensagem}`));
  ok(await escalar("SELECT COUNT(*) FROM PedidosExpansao WHERE ExtensaoId = @e AND Status IN (N'EM_PARECER', N'AGUARDANDO_CLI')", { e: ext1 }) === 1, "um em andamento por Extensão");
  const pEma = await escalar("SELECT PedidoId FROM PedidosExpansao WHERE ExtensaoId = @e AND Status = N'EM_PARECER'", { e: ext1 });

  console.log("== quatro pareceres ==");
  rs = await disparar([{ quem: "PASTOR", parecer: "FAVORAVEL" }, { quem: "MISS", parecer: "CONTRARIO" }, { quem: "PASTOR", parecer: "CONTRARIO" }, { quem: "MISS", parecer: "FAVORAVEL" }]
    .map((x) => ({ acao: "parecer", quem: x.quem, corpo: { pedidoId: pEma, parecer: x.parecer, fundamentacao: "Fundamentação das corridas." } })));
  ok(semErro(rs) && ganhos(rs) === 1, "um parecer só", rs.map((x) => `${x.status} ${x.mensagem}`));

  console.log("== a emancipação junto com a troca do Encarregado ==");
  await q("UPDATE MembroReferencia SET ExtensaoId = @e WHERE MembroId IN (9408, 9409)", { e: ext1 });
  rs = await disparar([{ acao: "decidir", corpo: { pedidoId: pEma, sessaoId: cli, resultado: "APROVADO" } }, { acao: "encarregado", quem: "DIR", corpo: { extensaoId: ext1, membroId: 9403, motivo: "Troca na corrida." } },
    { acao: "encarregado", quem: "DIR", corpo: { extensaoId: ext1, membroId: 9404, motivo: "Troca na corrida." } }]);
  ok(semErro(rs), "nenhum erro 500", rs.map((x) => `${x.status} ${x.mensagem}`));
  ok(await escalar("SELECT COUNT(*) FROM ExtensaoEncarregados WHERE ExtensaoId = @e AND Ate IS NULL", { e: ext1 }) === 0, "a Extensão emancipada não ficou com Encarregado em aberto");
  ok(await escalar("SELECT Ativa FROM ExtensoesTenda WHERE ExtensaoId = @e", { e: ext1 }) === false, "a Extensão ficou emancipada");
  ok(await escalar("SELECT COUNT(*) FROM MembroReferencia WHERE ExtensaoId = @e", { e: ext1 }) === 0, "ninguém ficou na Extensão emancipada");

  console.log("== duas aberturas homônimas aprovadas ao mesmo tempo ==");
  const pa = await abertura("Tenda Gêmea E2E"), pb = await abertura("tenda gemea e2e", 9405);
  rs = await disparar([{ acao: "decidir", corpo: { pedidoId: pa, sessaoId: cli, resultado: "APROVADO" } }, { acao: "decidir", corpo: { pedidoId: pb, sessaoId: cli, resultado: "APROVADO" } }]);
  ok(semErro(rs) && ganhos(rs) === 1, "uma das duas", rs.map((x) => `${x.status} ${x.mensagem}`));
  ok(await escalar("SELECT COUNT(*) FROM ExtensoesTenda WHERE Nome COLLATE Latin1_General_CI_AI = N'tenda gemea e2e'") === 1, "uma Extensão com o nome");

  console.log("== duas congregações novas homônimas ==");
  const n1 = await pedir({ tipo: "NOVA_CONGREGACAO", nome: "Siloé E2E" }, 1002), n2 = await pedir({ tipo: "NOVA_CONGREGACAO", nome: "SILOE e2e" }, 1002);
  rs = await disparar([{ acao: "decidir", corpo: { pedidoId: n1, sessaoId: cli, resultado: "APROVADO", urgencia: true } }, { acao: "decidir", corpo: { pedidoId: n2, sessaoId: cli, resultado: "APROVADO", urgencia: true } }]);
  ok(semErro(rs) && ganhos(rs) === 1, "uma das duas", rs.map((x) => `${x.status} ${x.mensagem}`));
  ok(await escalar("SELECT COUNT(*) FROM Congregacoes WHERE Nome COLLATE Latin1_General_CI_AI = N'siloe e2e'") === 1, "uma congregação com o nome");

  console.log("== quatro trocas de Encarregado ==");
  const p3 = await abertura("Tenda Corrida Três E2E");
  await db.decidir(pool, { pedidoId: p3, dados: { sessaoId: cli, resultado: "APROVADO" }, por: 1002, hoje: hojeBr(), alcance: GERAL });
  const ext3 = await escalar("SELECT ExtensaoId FROM ExtensoesTenda WHERE Nome = N'Tenda Corrida Três E2E'");
  rs = await disparar([9403, 9404, 9406, 9407].map((m) => ({ acao: "encarregado", quem: "DIR", corpo: { extensaoId: ext3, membroId: m, motivo: "Troca na corrida." } })));
  ok(semErro(rs), "nenhum erro 500", rs.map((x) => `${x.status} ${x.mensagem}`));
  ok(await escalar("SELECT COUNT(*) FROM ExtensaoEncarregados WHERE ExtensaoId = @e AND Ate IS NULL", { e: ext3 }) === 1, "um Encarregado em aberto");
  ok(await escalar("SELECT COUNT(*) FROM ExtensaoEncarregados WHERE ExtensaoId = @e", { e: ext3 }) === ganhos(rs) + 1, "o histórico tem uma linha por troca que passou");

  fim(`e2e-72 expansão: corridas${process.env.E2E_RCSI === "1" ? " (READ_COMMITTED_SNAPSHOT)" : ""}`);
}

if (process.argv[2] === "filho") filho();
else principal().catch((e) => { console.log("FALHOU:", e && e.stack); process.exitCode = 1; L.shimEncerrar(); });
