// e2e-79-territorio-corridas.js — v9.5 (Mapa territorial): corridas de verdade (N processos node, cada um com a sua conexão ao SQL Server) sobre a base
// "cenario-territorio". Quatro cadastros do mesmo bairro (com maiúscula e acento diferentes); quatro edições do mesmo bairro com a mesma versão; duas junções
// cruzadas (A em B e B em A) e uma terceira (C em A); a desativação de um bairro vazio junto com a gravação de um morador nele; quatro mudanças do raio;
// quatro edições do mesmo critério; o apagar junto com o editar; quatro pontos da mesma Extensão. Cada processo filho roda este mesmo arquivo com "filho".
process.env.AUTH_SECRET = "segredo-das-corridas-do-territorio-" + "x".repeat(24);
const { spawn } = require("child_process");
const L = require("./lib");
const { path } = L;

const TOKENS = {
  SEC: () => L.GERAL(1002, ["expansao", "pessoas"]),
  DIR: () => L.LIDER(3001, ["expansao"], ["Central E2E"])
};

async function filho() {
  const spec = JSON.parse(process.argv[3]);
  const { chamarRota } = require("./lib-afm");
  await L.obterPool();
  const espera = spec.t0 - Date.now();
  if (espera > 0) await new Promise((r) => setTimeout(r, espera));
  try {
    let res;
    if (spec.meusDados) res = await chamarRota("AtualizarMeusDados/index.js", { metodo: "POST", binding: { matricula: String(spec.meusDados) }, token: L.PIN(spec.meusDados), corpo: spec.corpo });
    else res = await chamarRota("GestaoTerritorio/index.js", { metodo: "POST", binding: { acao: spec.acao }, token: TOKENS[spec.quem || "SEC"](), corpo: spec.corpo || {} });
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
  const { ok, fim, q, escalar, um } = L;
  const { chamarRota } = require("./lib-afm");
  await L.obterPool();
  if (process.env.E2E_RCSI === "1") {
    await q("ALTER DATABASE CURRENT SET READ_COMMITTED_SNAPSHOT ON WITH ROLLBACK IMMEDIATE");
    ok((await escalar("SELECT CAST(is_read_committed_snapshot_on AS INT) FROM sys.databases WHERE name = DB_NAME()")) === 1, "READ_COMMITTED_SNAPSHOT ligado (como o Azure SQL)");
  }
  const central = await escalar("SELECT CongregacaoId FROM Congregacoes WHERE Nome = N'Central E2E'");
  for (let m = 9801; m <= 9806; m++) {
    await q("INSERT INTO MembroReferencia (MembroId, Nome, CongregacaoId, Status, SituacaoMembro) VALUES (@m, @n, @c, 'ATIVO', 'EM_COMUNHAO')", { m, n: `Pessoa Corrida Território ${m}`, c: central });
  }
  const POST = (acao, corpo, quem = "SEC") => chamarRota("GestaoTerritorio/index.js", { metodo: "POST", binding: { acao }, token: TOKENS[quem](), corpo });
  const versaoBairro = (b) => escalar("SELECT Versao FROM Bairros WHERE BairroId = @b", { b });

  console.log("== quatro cadastros do mesmo bairro ==");
  let rs = await disparar(["Bairro Corrida E2E", "bairro corrida e2e", "BAIRRO CORRIDA E2E", "Bairro Corrida E2E"].map((nome) => ({ acao: "bairro", corpo: { nome, cidade: "Parauapebas", uf: "PA" } })));
  ok(semErro(rs) && ganhos(rs) === 1, "um só nasce; os outros recebem a recusa (nenhum erro 500)", rs);
  ok((await escalar("SELECT COUNT(*) FROM Bairros WHERE Nome = N'Bairro Corrida E2E' AND Ativo = 1")) === 1, "um só no banco");

  console.log("== quatro edições do mesmo bairro, a mesma versão ==");
  const bA = (await POST("bairro", { nome: "Corrida A E2E", cidade: "Parauapebas", uf: "PA" })).body.bairroId;
  const bB = (await POST("bairro", { nome: "Corrida B E2E", cidade: "Parauapebas", uf: "PA" })).body.bairroId;
  const bC = (await POST("bairro", { nome: "Corrida C E2E", cidade: "Parauapebas", uf: "PA" })).body.bairroId;
  rs = await disparar([1, 2, 3, 4].map((i) => ({ acao: "bairro-editar", corpo: { bairroId: bA, versao: 0, nome: "Corrida A E2E", cidade: "Parauapebas", uf: "PA", lat: `-6.0${i}`, lng: "-49.9" } })));
  ok(semErro(rs) && ganhos(rs) === 1 && (await versaoBairro(bA)) === 1, "uma edição passa; a versão subiu uma vez", rs);

  console.log("== junções cruzadas ==");
  await q("UPDATE MembroReferencia SET EnderecoBairroId = @b WHERE MembroId IN (9801, 9802)", { b: bA });
  await q("UPDATE MembroReferencia SET EnderecoBairroId = @b WHERE MembroId IN (9803)", { b: bB });
  await q("UPDATE MembroReferencia SET EnderecoBairroId = @b WHERE MembroId IN (9804)", { b: bC });
  const vA = await versaoBairro(bA), vB = await versaoBairro(bB), vC = await versaoBairro(bC);
  rs = await disparar([
    { acao: "bairro-juntar", corpo: { bairroId: bA, versao: vA, destinoId: bB } },
    { acao: "bairro-juntar", corpo: { bairroId: bB, versao: vB, destinoId: bA } },
    { acao: "bairro-juntar", corpo: { bairroId: bC, versao: vC, destinoId: bA } }
  ]);
  ok(semErro(rs), "nenhuma junção derruba a outra com erro (sem trava mortal)", rs);
  const ativos = await escalar("SELECT COUNT(*) FROM Bairros WHERE BairroId IN (@a, @b, @c) AND Ativo = 1", { a: bA, b: bB, c: bC });
  const orfaos = await escalar("SELECT COUNT(*) FROM MembroReferencia m JOIN Bairros b ON b.BairroId = m.EnderecoBairroId WHERE m.MembroId BETWEEN 9801 AND 9804 AND b.Ativo = 0");
  ok(ativos >= 1 && orfaos === 0, "sobra pelo menos um bairro ativo e nenhum morador num bairro desativado", { ativos, orfaos, rs });
  ok((await escalar("SELECT COUNT(DISTINCT EnderecoBairroId) FROM MembroReferencia WHERE MembroId BETWEEN 9801 AND 9804")) === ativos, "os 4 moradores estão nos bairros que sobraram");

  console.log("== desativar um bairro vazio enquanto alguém grava um morador nele ==");
  const bD = (await POST("bairro", { nome: "Corrida D E2E", cidade: "Parauapebas", uf: "PA" })).body.bairroId;
  const vD = await versaoBairro(bD);
  rs = await disparar([
    { acao: "bairro-ativo", corpo: { bairroId: bD, versao: vD, ativo: false } },
    { meusDados: 9805, corpo: { enderecoPartes: { logradouro: "Rua da Corrida", bairroId: bD } } }
  ]);
  ok(semErro(rs), "nenhum erro 500", rs);
  const morador = await escalar("SELECT EnderecoBairroId FROM MembroReferencia WHERE MembroId = 9805");
  const ativoD = (await um("SELECT Ativo FROM Bairros WHERE BairroId = @b", { b: bD })).Ativo;
  ok(morador === bD || morador === null, "o morador ficou no bairro (gravou antes) ou de fora (recusado)", { morador, ativoD });
  if (morador === bD && ativoD === false) {
    // a sobra da corrida: a pessoa ainda salva a ficha dela, e o nível geral a leva ao bairro certo juntando
    const r = await chamarRota("AtualizarMeusDados/index.js", { metodo: "POST", binding: { matricula: "9805" }, token: L.PIN(9805), corpo: { enderecoPartes: { logradouro: "Rua da Corrida, 2", bairroId: bD } } });
    ok(r.body.sucesso === true, "o morador de um bairro desativado na corrida ainda salva a ficha");
    const j = await POST("bairro-juntar", { bairroId: bD, versao: await versaoBairro(bD), destinoId: bB });
    ok(j.body.sucesso === true && j.body.membrosMovidos === 1, "e a junção leva o morador ao bairro certo");
  } else ok(true, "a corrida não deixou sobra desta vez (o morador ficou num bairro ativo ou foi recusado)");

  console.log("== quatro mudanças do raio ==");
  const vRaio = await escalar("SELECT Versao FROM TerritorioParametros WHERE Id = 1");
  rs = await disparar(["1", "2", "4", "5"].map((raioKm) => ({ acao: "raio", corpo: { raioKm, versao: vRaio } })));
  ok(semErro(rs) && ganhos(rs) === 1 && (await escalar("SELECT Versao FROM TerritorioParametros WHERE Id = 1")) === vRaio + 1, "uma só mudança passa", rs);

  console.log("== critérios ==");
  const c = await um("SELECT TOP 1 CriterioId, Versao FROM CriteriosEmancipacao WHERE Indicador = N'MEMBROS_EM_COMUNHAO'");
  rs = await disparar([10, 20, 30, 40].map((valor) => ({ acao: "criterio-editar", corpo: { criterioId: c.CriterioId, versao: c.Versao, indicador: "MEMBROS_EM_COMUNHAO", operador: "MINIMO", valor } })));
  ok(semErro(rs) && ganhos(rs) === 1, "quatro edições do mesmo critério: uma passa", rs);
  const c2 = await um("SELECT CriterioId, Versao FROM CriteriosEmancipacao WHERE CriterioId = @c", { c: c.CriterioId });
  rs = await disparar([
    { acao: "criterio-apagar", corpo: { criterioId: c2.CriterioId, versao: c2.Versao } },
    { acao: "criterio-editar", corpo: { criterioId: c2.CriterioId, versao: c2.Versao, indicador: "MEMBROS_EM_COMUNHAO", operador: "MINIMO", valor: 99 } }
  ]);
  const existe = await escalar("SELECT COUNT(*) FROM CriteriosEmancipacao WHERE CriterioId = @c", { c: c2.CriterioId });
  ok(semErro(rs) && ganhos(rs) === 1, "apagar junto com editar: só um dos dois", rs);
  ok((rs[0].sucesso && existe === 0) || (rs[1].sucesso && existe === 1), "o banco ficou com o resultado de quem ganhou");

  console.log("== quatro pontos da mesma Extensão ==");
  const ext = await escalar("INSERT INTO ExtensoesTenda (Nome, CongregacaoMaeId, Ativa) OUTPUT INSERTED.ExtensaoId VALUES (N'Tenda Corrida E2E', @c, 1)", { c: central });
  rs = await disparar([1, 2, 3, 4].map((i) => ({ acao: "ponto-extensao", quem: i % 2 ? "DIR" : "SEC", corpo: { extensaoId: ext, lat: `-6.1${i}`, lng: "-49.9" } })));
  const p = await um("SELECT Lat, Lng, PontoMarcadoPor FROM ExtensoesTenda WHERE ExtensaoId = @e", { e: ext });
  ok(semErro(rs) && ganhos(rs) === 4 && [-6.11, -6.12, -6.13, -6.14].includes(Number(p.Lat)) && [1002, 3001].includes(p.PontoMarcadoPor), "os quatro gravam em fila; fica o último, inteiro (nunca meio ponto)", { p, rs });

  fim(`e2e-79 território: corridas${process.env.E2E_RCSI === "1" ? " (RCSI)" : ""}`);
}

if (process.argv[2] === "filho") filho();
else principal().catch((e) => { console.log("ERRO", e && e.stack); process.exitCode = 1; L.shimEncerrar(); });
