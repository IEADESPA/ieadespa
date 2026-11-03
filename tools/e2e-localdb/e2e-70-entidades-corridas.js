// e2e-70-entidades-corridas.js — v9.1 (Entidades vinculadas): corridas de verdade (N processos node, cada um com a sua conexão ao SQL Server) sobre a base
// "cenario-entidades". Quatro aprovações do mesmo vínculo; quatro apurações da mesma entidade; quatro Diretores-Presidentes; quatro entregas do mesmo período;
// três decretações; quatro rotinas marcando a mesma caducidade; duas ratificações; a extinção junto com novas indicações (nenhum mandato aberto em entidade extinta).
// Cada processo filho roda este mesmo arquivo com o primeiro argumento "filho".
process.env.AUTH_SECRET = "segredo-das-corridas-das-entidades-" + "x".repeat(24);
const { spawn } = require("child_process");
const L = require("./lib");
const { path } = L;
const PRES_ID = 1001, SEC_ID = 1002;

async function filho() {
  const spec = JSON.parse(process.argv[3]);
  const { chamarRota } = require("./lib-afm");
  const pool = await L.obterPool();
  const espera = spec.t0 - Date.now();
  if (espera > 0) await new Promise((r) => setTimeout(r, espera));
  try {
    if (spec.funcao) {
      const mod = require(path.join(L.API, "shared/entidadesVinculadasDb.js"));
      const resultado = await mod[spec.funcao](pool, { hoje: L.hojeBr() });
      process.stdout.write("@@RESULTADO@@" + JSON.stringify({ ok: true, status: 200, resultado }) + "\n");
    } else {
      const token = L.GERAL(spec.pres ? PRES_ID : SEC_ID, ["entidades_vinculadas"]);
      const res = await chamarRota("GestaoEntidadesVinculadas/index.js", { metodo: "POST", binding: { acao: spec.acao }, token, corpo: spec.corpo || {} });
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
const ganhos = (rs) => rs.filter((x) => x.sucesso === true).length;

async function principal() {
  const { ok, fim, q, escalar, hojeBr } = L;
  await L.obterPool();
  // E2E_RCSI=1: o banco com READ_COMMITTED_SNAPSHOT ligado, como o Azure SQL (a leitura não espera a gravação em curso: as travas UPDLOCK é que seguram a corrida)
  if (process.env.E2E_RCSI === "1") {
    await q("ALTER DATABASE CURRENT SET READ_COMMITTED_SNAPSHOT ON WITH ROLLBACK IMMEDIATE");
    ok((await escalar("SELECT CAST(is_read_committed_snapshot_on AS INT) FROM sys.databases WHERE name = DB_NAME()")) === 1, "READ_COMMITTED_SNAPSHOT ligado (como o Azure SQL)");
  }
  const ev = require(path.join(L.API, "shared/entidadesVinculadas.js"));
  const dias = (n) => ev.somarDias(hojeBr(), n);
  const central = await escalar("SELECT CongregacaoId FROM Congregacoes WHERE Nome = N'Central E2E'");
  for (let m = 9401; m <= 9408; m++) {
    await q(`INSERT INTO MembroReferencia (MembroId, Nome, CongregacaoId, Status, SituacaoMembro, DataNascimento, DataAdmissao) VALUES (@m, @n, @c, 'ATIVO', 'EM_COMUNHAO', '1980-01-01', '2010-01-01')`,
      { m, n: `Pessoa Corrida ${m} E2E`, c: central });
  }
  await q(`INSERT INTO Assentos (OrgaoId, MembroId, TipoAssento, CargoOuFuncao, DataInicio) SELECT OrgaoId, @m, 'FUNCAO', 'PRESIDENTE', '2025-01-01' FROM Orgaos WHERE Sigla = 'DIRETORIA_EXECUTIVA'`, { m: PRES_ID });
  const cli = await escalar(`INSERT INTO Sessoes (OrgaoId, Descricao, DataSessao, TipoSessao, Status) OUTPUT INSERTED.SessaoId SELECT OrgaoId, N'CLI corrida', @d, 'EXTRAORDINARIA', 'ENCERRADA' FROM Orgaos WHERE Sigla = 'CLI'`, { d: hojeBr() });
  const tipo = await escalar("SELECT TipoId FROM EntidadeTipos WHERE Nome = N'Outra entidade'");
  const nova = (cnpj, status) => escalar(`INSERT INTO EntidadesVinculadas (RazaoSocial, Cnpj, TipoId, Finalidade, Status, CadastradaPor, VinculoSessaoId, VinculoEm)
    OUTPUT INSERTED.EntidadeId VALUES (@r, @c, @t, N'Finalidade da corrida E2E.', @s, 1002, CASE WHEN @s = 'ATIVA' THEN @cli END, CASE WHEN @s = 'ATIVA' THEN @v END)`,
  { r: `Entidade Corrida ${cnpj}`, c: cnpj, t: tipo, s: status, cli, v: `${Number(hojeBr().slice(0, 4)) - 1}-01-15` });
  const proposta = await nova("45723174000110", "PROPOSTA");
  const ativa = await nova("11222333000181", "ATIVA");
  const extinguir = await nova("11444777000161", "ATIVA");
  const ag = await escalar(`INSERT INTO Sessoes (OrgaoId, Descricao, DataSessao, TipoSessao, Status) OUTPUT INSERTED.SessaoId SELECT OrgaoId, N'AG corrida', @d, 'ORDINARIA', 'ENCERRADA' FROM Orgaos WHERE Sigla = 'ASSEMBLEIA_GERAL'`, { d: hojeBr() });
  await q("UPDATE EntidadesVinculadas SET VinculoAGSessaoId = @s, VinculoAGResultado = 'RATIFICADA', VinculoAGEm = @d WHERE EntidadeId = @e", { s: ag, d: hojeBr(), e: extinguir });

  console.log("== quatro aprovações do mesmo vínculo ==");
  let rs = await disparar(Array.from({ length: 4 }, () => ({ acao: "vinculo-aprovar", corpo: { entidadeId: proposta, sessaoId: cli } })));
  ok(semErro(rs) && ganhos(rs) === 1, "uma passa, as outras recebem a recusa", rs.map((x) => [x.status, x.sucesso]));
  ok(await escalar("SELECT COUNT(*) FROM AuditLog WHERE Tabela = 'EntidadesVinculadas' AND RegistroId = @e AND Acao = 'ENTIDADE_VINCULO_APROVADO_CLI'", { e: proposta }) === 1, "uma linha de auditoria");

  console.log("== quatro apurações da mesma entidade ==");
  rs = await disparar(Array.from({ length: 4 }, (_, i) => ({ acao: "apuracao-abrir", corpo: { entidadeId: ativa, motivo: "RISCO_IMAGEM", fatos: `Fatos da corrida número ${i} (e2e).` } })));
  ok(semErro(rs) && ganhos(rs) === 1 && (await escalar("SELECT COUNT(*) FROM EntidadeIntervencoes WHERE EntidadeId = @e", { e: ativa })) === 1, "uma apuração em curso", rs.map((x) => [x.status, x.sucesso]));

  console.log("== quatro Diretores-Presidentes ==");
  rs = await disparar(Array.from({ length: 4 }, (_, i) => ({ acao: "dirigente-indicar", corpo: { entidadeId: ativa, funcao: "DIRETOR_PRESIDENTE", membroId: 9401 + i, indicacaoAto: "Ato corrida", indicadoEm: dias(-30) } })));
  ok(semErro(rs) && ganhos(rs) === 1 && (await escalar("SELECT COUNT(*) FROM EntidadeDirigentes WHERE EntidadeId = @e AND Funcao = 'DIRETOR_PRESIDENTE'", { e: ativa })) === 1, "um só em aberto", rs.map((x) => [x.status, x.sucesso, x.mensagem]));

  console.log("== quatro entregas do mesmo período ==");
  const periodo = String(Number(hojeBr().slice(0, 4)) - 1);
  rs = await disparar(Array.from({ length: 4 }, (_, i) => ({ acao: "prestacao-registrar", corpo: { entidadeId: ativa, periodo, entregueEm: hojeBr(), relatorioAtividades: true, balancoAuditado: true, auditoriaOrgao: `Auditor ${i}` } })));
  ok(semErro(rs) && (await escalar("SELECT COUNT(*) FROM EntidadePrestacoes WHERE EntidadeId = @e", { e: ativa })) === 1, "uma linha do período, nenhum erro", rs.map((x) => [x.status, x.sucesso, x.mensagem]));

  console.log("== três decretações ==");
  const iv = await escalar("SELECT IntervencaoId FROM EntidadeIntervencoes WHERE EntidadeId = @e", { e: ativa });
  await q("UPDATE EntidadeIntervencoes SET AbertaEm = @a, NotificadoEm = @n, NotificacaoForma = N'Carta' WHERE IntervencaoId = @i", { i: iv, a: dias(-12), n: dias(-6) });
  rs = await disparar(Array.from({ length: 3 }, (_, i) => ({ pres: true, acao: "intervencao-decretar", corpo: { intervencaoId: iv, fundamentacao: `Fundamentação da corrida número ${i}, com os motivos de gestão.`, interventorMembroId: 9406 } })));
  ok(semErro(rs) && ganhos(rs) === 1, "uma decretação", rs.map((x) => [x.status, x.sucesso]));

  console.log("== quatro rotinas marcando a mesma caducidade ==");
  await q("UPDATE EntidadeIntervencoes SET DecretadaEm = @d, PrazoRatificacao = @p, NotificadoEm = @n WHERE IntervencaoId = @i", { i: iv, d: dias(-20), p: dias(-5), n: dias(-26) });
  rs = await disparar(Array.from({ length: 4 }, () => ({ funcao: "caducarVencidas" })));
  ok(semErro(rs) && rs.reduce((s, x) => s + ((x.resultado || []).includes(iv) ? 1 : 0), 0) === 1, "só uma marca", rs.map((x) => x.resultado));
  ok(await escalar("SELECT COUNT(*) FROM AuditLog WHERE Tabela = 'EntidadeIntervencoes' AND RegistroId = @i AND Acao = 'ENTIDADE_INTERVENCAO_CADUCADA'", { i: iv }) === 1, "uma linha de auditoria");

  console.log("== duas ratificações (a reunião foi dentro do prazo) ==");
  const cliPrazo = await escalar(`INSERT INTO Sessoes (OrgaoId, Descricao, DataSessao, TipoSessao, Status) OUTPUT INSERTED.SessaoId SELECT OrgaoId, N'CLI prazo corrida', @d, 'EXTRAORDINARIA', 'ENCERRADA' FROM Orgaos WHERE Sigla = 'CLI'`, { d: dias(-10) });
  rs = await disparar([{ acao: "intervencao-ratificar", corpo: { intervencaoId: iv, sessaoId: cliPrazo, resultado: "RATIFICADA" } }, { acao: "intervencao-ratificar", corpo: { intervencaoId: iv, sessaoId: cliPrazo, resultado: "NAO_RATIFICADA" } }]);
  ok(semErro(rs) && ganhos(rs) === 1, "uma decisão só", rs.map((x) => [x.status, x.sucesso]));

  console.log("== extinção junto com novas indicações ==");
  rs = await disparar([
    { acao: "extinguir", corpo: { entidadeId: extinguir, sessaoId: cli, destinoPatrimonio: "CONGENERE_SEM_FINS", destinatarioNome: "Destino da corrida" } },
    ...Array.from({ length: 3 }, (_, i) => ({ acao: "dirigente-indicar", corpo: { entidadeId: extinguir, funcao: "SECRETARIO", membroId: 9401 + i, indicacaoAto: "Ato corrida", indicadoEm: dias(-1) } }))
  ]);
  ok(semErro(rs), "nenhum erro", rs.map((x) => [x.status, x.sucesso]));
  ok((await escalar("SELECT Status FROM EntidadesVinculadas WHERE EntidadeId = @e", { e: extinguir })) === "EXTINTA"
    && (await escalar("SELECT COUNT(*) FROM EntidadeDirigentes WHERE EntidadeId = @e AND Status IN ('INDICADO','HOMOLOGADO')", { e: extinguir })) === 0, "extinta e sem mandato aberto", rs.map((x) => x.mensagem));

  if (process.env.E2E_RCSI === "1") await q("ALTER DATABASE CURRENT SET READ_COMMITTED_SNAPSHOT OFF WITH ROLLBACK IMMEDIATE");
  fim("e2e-70 entidades vinculadas (corridas)");
}

if (process.argv[2] === "filho") filho();
else principal().catch((e) => { console.log("ERRO", e); process.exit(1); });
