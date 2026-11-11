// e2e-77-missoes-corridas.js — v9.4 (Missões): corridas de verdade (N processos node, cada um com a sua conexão ao SQL Server) sobre a base "cenario-missoes".
// Quatro gerações do mesmo mês; a geração junto com o reajuste e com o encerramento (a mesma trava: o reajuste nunca cai num mês gerado, o último mês nunca fica
// antes de um gerado); quatro pareceres; a decisão da CLI junto com a desistência; quatro concordâncias do Presidente; quatro pedidos para a mesma pessoa; quatro
// relatórios do mesmo período; quatro campos homônimos. Cada processo filho roda este mesmo arquivo com o primeiro argumento "filho".
process.env.AUTH_SECRET = "segredo-das-corridas-das-missoes-" + "x".repeat(24);
const { spawn } = require("child_process");
const L = require("./lib");
const { path } = L;

const TOKENS = {
  SEMI: () => L.LIDER(9801, ["missoes"], [], "DEPARTAMENTO"),
  SEC: () => L.GERAL(1002, ["missoes", "financeiro"]),
  PRES: () => L.GERAL(1001, ["missoes"]),
  CME: () => L.LIDER(3003, ["missoes", "expansao"], ["Central E2E", "Vila Nova E2E"], "AREA")
};
const DOC = { documentoBase64: Buffer.from("%PDF termo").toString("base64"), documentoMime: "application/pdf" };

async function filho() {
  const spec = JSON.parse(process.argv[3]);
  const st = require(path.join(L.API, "shared/storage.js"));
  st.salvarDocumento = async () => `https://blob.e2e/documentos/doc-corrida-${process.pid}-${Date.now()}`;
  st.urlDocumentoComSas = (u) => u;
  const { chamarRota } = require("./lib-afm");
  await L.obterPool();
  const espera = spec.t0 - Date.now();
  if (espera > 0) await new Promise((r) => setTimeout(r, espera));
  try {
    const res = await chamarRota("GestaoMissoes/index.js", { metodo: "POST", binding: { acao: spec.acao }, token: TOKENS[spec.quem || "SEMI"](), corpo: spec.corpo || {} });
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
  const st = require(path.join(L.API, "shared/storage.js"));
  st.salvarDocumento = async () => `https://blob.e2e/documentos/doc-corrida-pai-${Date.now()}`;
  const { chamarRota } = require("./lib-afm");
  const mi = require(path.join(L.API, "shared/missoes.js"));
  await L.obterPool();
  if (process.env.E2E_RCSI === "1") {
    await q("ALTER DATABASE CURRENT SET READ_COMMITTED_SNAPSHOT ON WITH ROLLBACK IMMEDIATE");
    ok((await escalar("SELECT CAST(is_read_committed_snapshot_on AS INT) FROM sys.databases WHERE name = DB_NAME()")) === 1, "READ_COMMITTED_SNAPSHOT ligado (como o Azure SQL)");
  }
  const hoje = hojeBr(), mes = mi.mesDe(hoje), proximo = mi.somarMeses(mes, 1), m1 = mi.somarMeses(mes, -1);
  const central = await escalar("SELECT CongregacaoId FROM Congregacoes WHERE Nome = N'Central E2E'");
  const semiadespa = await escalar("SELECT DepartamentoId FROM Departamentos WHERE Sigla = 'SEMIADESPA'");
  for (let m = 9801; m <= 9820; m++) {
    await q("INSERT INTO MembroReferencia (MembroId, Nome, CongregacaoId, Status, SituacaoMembro, Email) VALUES (@m, @n, @c, 'ATIVO', 'EM_COMUNHAO', @e)", { m, n: `Pessoa Corrida Missões ${m}`, c: central, e: `c${m}@exemplo.org` });
  }
  if (!(await escalar("SELECT COUNT(*) FROM Assentos a JOIN Orgaos o ON o.OrgaoId = a.OrgaoId WHERE o.Sigla = 'DIRETORIA_EXECUTIVA' AND a.CargoOuFuncao = 'PRESIDENTE' AND a.MembroId = 1001 AND a.DataFim IS NULL"))) {
    await q(`INSERT INTO Assentos (OrgaoId, MembroId, TipoAssento, CargoOuFuncao, DataInicio) SELECT OrgaoId, 1001, 'FUNCAO', 'PRESIDENTE', '2025-01-01' FROM Orgaos WHERE Sigla = 'DIRETORIA_EXECUTIVA'`);
  }
  await q("INSERT INTO Lideranca (MembroId, PapelId, EscopoTipo, EscopoId) SELECT 9801, PapelId, 'DEPARTAMENTO', @d FROM Papeis WHERE Nome = N'Secretário de Missões'", { d: semiadespa });
  // a pessoa física que recebe é o próprio missionário: um fornecedor ligado a cada matrícula
  const fornDe = {};
  for (let m = 9802; m <= 9810; m++) {
    fornDe[m] = await escalar(`INSERT INTO Fornecedores (Nome, CpfCnpj, Tipo, Banco, Agencia, Conta, DadosBancariosConfirmados, CriadoPor, MembroId) OUTPUT INSERTED.FornecedorId
      VALUES (@n, @c, N'PF', N'Banco', N'1', N'2', 1, 1002, @m)`, { n: `Recebedor Corrida ${m}`, c: `321.654.${m}-00`, m });
  }
  const reuniao = await escalar(`INSERT INTO Sessoes (OrgaoId, Descricao, DataSessao, TipoSessao, Status) OUTPUT INSERTED.SessaoId SELECT OrgaoId, N'CLI corridas E2E', @d, N'EXTRAORDINARIA', N'ENCERRADA' FROM Orgaos WHERE Sigla = N'CLI'`, { d: hoje });
  const POST = (acao, corpo, quem = "SEMI") => chamarRota("GestaoMissoes/index.js", { metodo: "POST", binding: { acao }, token: TOKENS[quem](), corpo });
  let r = await POST("campo", { nome: "Campo Corrida Local", uf: "PA", cidade: "Parauapebas", divulgacao: "PUBLICA" });
  const campoLocal = r.body.campoId;
  r = await POST("campo", { nome: "Campo Corrida Estadual", uf: "PA", cidade: "Belém" });
  const campoEstadual = r.body.campoId;
  // envios ativos com sustento (Local + Presidente), para as corridas do sustento
  const ativo = async (membroId, valor) => {
    const p = await POST("envio", { campoId: campoLocal, membroId, sustento: valor, fonte: "GERAL", fornecedorId: fornDe[membroId], ...DOC, periodicidade: "MENSAL", justificativa: "Envio para as corridas do sustento." });
    // Trava 9-B: o sustento passa pela CLI (Estatuto Art. 58 §4º) antes do Presidente
    await POST("decidir", { envioId: p.body.envioId, resultado: "APROVADO", sessaoId: reuniao }, "SEC");
    await POST("presidente", { envioId: p.body.envioId, resultado: "CONCORDA" }, "PRES");
    return p.body.envioId;
  };
  const e1 = await ativo(9802, 100), e2 = await ativo(9803, 200), e3 = await ativo(9804, 300);
  ok((await escalar("SELECT COUNT(*) FROM EnviosMissionarios WHERE EnvioId IN (@a, @b, @c) AND Status = N'ATIVO'", { a: e1, b: e2, c: e3 })) === 3, "três envios ativos com sustento");

  console.log("== quatro gerações do mesmo mês ==");
  let rs = await disparar([1, 2, 3, 4].map(() => ({ acao: "gerar", quem: "SEC", corpo: { mesReferencia: m1 === mes ? mes : mes } })));
  ok(semErro(rs), "nenhum 500", rs);
  ok(ganhos(rs) === 1, "uma geração vence; as outras não acham nada a gerar", rs);
  ok((await escalar("SELECT COUNT(*) FROM SustentoGeracoes WHERE MesReferencia = @m", { m: mes })) === 3, "três gerações (uma por envio), nunca duplicadas");
  ok((await escalar("SELECT COUNT(*) FROM SaidasTesouraria WHERE Tipo = N'SUSTENTO_MISSIONARIO'")) === 3, "três Saídas: nenhuma solta");

  console.log("== a geração junto com o reajuste (a mesma trava) ==");
  // a geração do mês de hoje já existe; o reajuste deste mês e a geração do mês que começa já não existem: corrida com o reajuste do próximo e a geração do mês
  const e4 = await ativo(9805, 400);
  rs = await disparar([{ acao: "gerar", quem: "SEC", corpo: { mesReferencia: mes } }, { acao: "reajustar", quem: "PRES", corpo: { envioId: e4, desdeMes: mes, sustento: 450, sessaoId: reuniao, fonte: "GERAL", fornecedorId: fornDe[9805], motivo: "Reajuste na corrida." } }]);
  ok(semErro(rs), "nenhum 500", rs);
  const gerado = await escalar("SELECT Valor FROM SustentoGeracoes WHERE EnvioId = @e AND MesReferencia = @m", { e: e4, m: mes });
  const vigente = await escalar("SELECT TOP 1 Valor FROM EnvioSustentoValores WHERE EnvioId = @e AND DesdeMes <= @m ORDER BY DesdeMes DESC", { e: e4, m: mes });
  ok(gerado === vigente, "o valor gerado é o vigente no mês, qualquer que seja a ordem (o reajuste nunca cai num mês já gerado)", { gerado, vigente, rs });

  console.log("== a geração junto com o encerramento ==");
  const e5 = await ativo(9806, 500);
  rs = await disparar([{ acao: "gerar", quem: "SEC", corpo: { mesReferencia: mes } }, { acao: "encerrar", corpo: { envioId: e5, ultimoMes: m1, motivo: "Encerrado na corrida." } }]);
  ok(semErro(rs), "nenhum 500", rs);
  const fimMes = await escalar("SELECT FimMes FROM EnviosMissionarios WHERE EnvioId = @e", { e: e5 });
  const geradoE5 = await escalar("SELECT COUNT(*) FROM SustentoGeracoes WHERE EnvioId = @e AND MesReferencia = @m", { e: e5, m: mes });
  ok(!(fimMes && fimMes < mes && geradoE5), "nunca: encerrado antes do mês e o mês gerado", { fimMes, geradoE5, rs });

  console.log("== quatro pareceres, a decisão junto com a desistência ==");
  r = await POST("envio", { campoId: campoEstadual, membroId: 9807, sustento: 0, periodicidade: "MENSAL", justificativa: "Envio para as corridas do parecer." });
  const p1 = r.body.envioId;
  rs = await disparar([1, 2, 3, 4].map(() => ({ acao: "parecer", quem: "CME", corpo: { envioId: p1, parecer: "FAVORAVEL", fundamentacao: "Parecer dado na corrida." } })));
  ok(semErro(rs) && ganhos(rs) === 1, "um parecer só", rs);
  rs = await disparar([{ acao: "decidir", quem: "SEC", corpo: { envioId: p1, resultado: "APROVADO", sessaoId: reuniao } }, { acao: "desistir", corpo: { envioId: p1, motivo: "Desistência na corrida." } }]);
  ok(semErro(rs) && ganhos(rs) === 1, "a decisão e a desistência: uma só vence", rs);
  ok(["ATIVO", "DESISTIDO"].includes(await escalar("SELECT Status FROM EnviosMissionarios WHERE EnvioId = @e", { e: p1 })), "o estado final é um dos dois");

  console.log("== quatro concordâncias do Presidente ==");
  r = await POST("envio", { campoId: campoLocal, membroId: 9808, sustento: 150, fonte: "GERAL", fornecedorId: fornDe[9808], ...DOC, periodicidade: "MENSAL", justificativa: "Envio para a corrida do Presidente." });
  const p2 = r.body.envioId;
  await POST("decidir", { envioId: p2, resultado: "APROVADO", sessaoId: reuniao }, "SEC");
  rs = await disparar([1, 2, 3, 4].map(() => ({ acao: "presidente", quem: "PRES", corpo: { envioId: p2, resultado: "CONCORDA" } })));
  ok(semErro(rs) && ganhos(rs) === 1, "uma concordância só", rs);
  ok((await escalar("SELECT COUNT(*) FROM EnvioSustentoValores WHERE EnvioId = @e", { e: p2 })) === 1, "uma ativação só (um valor no histórico)");

  console.log("== quatro pedidos para a mesma pessoa ==");
  rs = await disparar([1, 2, 3, 4].map(() => ({ acao: "envio", corpo: { campoId: campoEstadual, membroId: 9809, sustento: 0, periodicidade: "MENSAL", justificativa: "Pedido em dobro na corrida." } })));
  ok(semErro(rs) && ganhos(rs) === 1, "um pedido só", rs);
  ok((await escalar("SELECT COUNT(*) FROM EnviosMissionarios WHERE MembroId = 9809")) === 1, "um envio vivo por pessoa");

  console.log("== quatro relatórios do mesmo período ==");
  rs = await disparar([1, 2, 3, 4].map(() => ({ acao: "relatorio", corpo: { envioId: e1, periodoInicio: mes, batismos: 1, atividades: "Relatório em dobro na corrida." } })));
  ok(semErro(rs) && ganhos(rs) === 1, "um relatório só", rs);
  ok((await escalar("SELECT COUNT(*) FROM RelatoriosCampo WHERE EnvioId = @e", { e: e1 })) === 1, "um relatório por período");

  console.log("== quatro campos homônimos ==");
  rs = await disparar(["Campo Corrida Nome", "campo corrida nome", "Campo Corrida Nóme", "CAMPO CORRIDA NOME"].map((nome) => ({ acao: "campo", corpo: { nome, uf: "PA", cidade: "Parauapebas" } })));
  ok(semErro(rs) && ganhos(rs) === 1, "um campo só", rs);

  fim(`e2e-77 missoes corridas${process.env.E2E_RCSI === "1" ? " (RCSI)" : ""}`);
}

if (process.argv[2] === "filho") filho();
else principal().catch((e) => { console.log("ERRO", e && e.stack); process.exit(1); });
