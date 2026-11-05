// e2e-74-distritos-corridas.js — v9.3 (Distrito): corridas de verdade (N processos node, cada um com a sua conexão ao SQL Server) sobre a base "cenario-distritos".
// Quatro ativações do mesmo Distrito; a intervenção junto com a desativação; quatro intervenções; quatro envios do mesmo balanço; quatro análises do mesmo
// balanço; quatro registros do mesmo Dízimo Institucional; o decreto junto com a intervenção em outro Distrito (a trava de aplicação é uma só, sem travamento).
// Cada processo filho roda este mesmo arquivo com o primeiro argumento "filho".
process.env.AUTH_SECRET = "segredo-das-corridas-dos-distritos-" + "x".repeat(24);
const { spawn } = require("child_process");
const L = require("./lib");
const { path } = L;

const TOKENS = {
  SEC: () => L.GERAL(1002, ["distritos", "financeiro"]),
  PRES: () => L.GERAL(1001, ["distritos"]),
  TES: () => L.LIDER(9603, ["distritos", "financeiro"], ["Central E2E", "Vila Nova E2E"], "DISTRITO"),
  NIF: () => L.LIDER(9604, ["distritos"], ["Beta E2E"])
};

async function filho() {
  const spec = JSON.parse(process.argv[3]);
  const { chamarRota } = require("./lib-afm");
  await L.obterPool();
  const espera = spec.t0 - Date.now();
  if (espera > 0) await new Promise((r) => setTimeout(r, espera));
  try {
    const res = spec.rota === "repasse"
      ? await chamarRota("GestaoRepassesInstitucionais/index.js", { metodo: "POST", binding: {}, token: TOKENS.SEC(), corpo: spec.corpo })
      : spec.rota === "rateio"
        ? await chamarRota("GestaoRateioGeral/index.js", { metodo: "POST", binding: {}, token: TOKENS.SEC(), corpo: spec.corpo })
        : await chamarRota("GestaoDistritos/index.js", { metodo: "POST", binding: { acao: spec.acao }, token: TOKENS[spec.quem || "SEC"](), corpo: spec.corpo || {} });
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
  const vila = await escalar("SELECT CongregacaoId FROM Congregacoes WHERE Nome = N'Vila Nova E2E'");
  const beta = await escalar("SELECT CongregacaoId FROM Congregacoes WHERE Nome = N'Beta E2E'");
  const area1 = await escalar("SELECT AreaId FROM Areas WHERE Nome = N'Área Alfa E2E'");
  const area2 = await escalar("SELECT AreaId FROM Areas WHERE Nome = N'Área Beta E2E'");
  for (let m = 9601; m <= 9608; m++) {
    await q(`INSERT INTO MembroReferencia (MembroId, Nome, CongregacaoId, Status, SituacaoMembro, DataNascimento, DataAdmissao) VALUES (@m, @n, @c, 'ATIVO', 'EM_COMUNHAO', '1980-01-01', '2010-01-01')`,
      { m, n: `Pessoa Corrida Dist ${m} E2E`, c: central });
  }
  if (!(await escalar("SELECT COUNT(*) FROM Assentos a JOIN Orgaos o ON o.OrgaoId = a.OrgaoId WHERE o.Sigla = 'DIRETORIA_EXECUTIVA' AND a.CargoOuFuncao = 'PRESIDENTE' AND a.MembroId = 1001 AND a.DataFim IS NULL"))) {
    await q(`INSERT INTO Assentos (OrgaoId, MembroId, TipoAssento, CargoOuFuncao, DataInicio) SELECT OrgaoId, 1001, 'FUNCAO', 'PRESIDENTE', '2025-01-01' FROM Orgaos WHERE Sigla = 'DIRETORIA_EXECUTIVA'`);
  }
  await q(`INSERT INTO Assentos (OrgaoId, MembroId, TipoAssento, CargoOuFuncao, DataInicio) SELECT OrgaoId, 9604, 'FUNCAO', 'MEMBRO', '2025-01-01' FROM Orgaos WHERE Sigla = 'CONSELHO_FISCAL'`);
  const novo = async (nome, area) => {
    const d = await escalar("INSERT INTO Distritos (Nome, Ativo) OUTPUT INSERTED.DistritoId VALUES (@n, 0)", { n: nome });
    const qd = await escalar("INSERT INTO Quadrantes (Nome, Ativo, DistritoId) OUTPUT INSERTED.QuadranteId VALUES (@n, 1, @d)", { n: `Quadrante de ${nome}`, d });
    const rg = await escalar("INSERT INTO Regioes (Nome, Ativa, QuadranteId) OUTPUT INSERTED.RegiaoId VALUES (@n, 1, @q)", { n: `Região de ${nome}`, q: qd });
    await q("UPDATE Areas SET RegiaoId = @r WHERE AreaId = @a", { r: rg, a: area });
    return d;
  };
  const dA = await novo("Distrito Corrida A E2E", area1);
  const dB = await novo("Distrito Corrida B E2E", area2);
  await q("INSERT INTO Lideranca (MembroId, PapelId, EscopoTipo, EscopoId) SELECT 9603, PapelId, 'DISTRITO', @d FROM Papeis WHERE Nome = N'Tesoureiro de Distrito'", { d: dA });
  const cli = await escalar(`INSERT INTO Sessoes (OrgaoId, Descricao, DataSessao, TipoSessao, Status) OUTPUT INSERTED.SessaoId SELECT OrgaoId, N'CLI corridas distritos', @d, 'EXTRAORDINARIA', 'ENCERRADA' FROM Orgaos WHERE Sigla = 'CLI'`, { d: hojeBr() });
  const ativ = (distritoId) => ({ distritoId, sessaoId: cli, gatilho: "METROPOLE", cidade: "Belém", uf: "PA", fundamentacao: "Decreto da CLI nas corridas dos Distritos." });

  console.log("== quatro ativações do mesmo Distrito ==");
  let rs = await disparar([1, 2, 3, 4].map(() => ({ acao: "ativar", corpo: ativ(dA) })));
  ok(semErro(rs), "nenhum erro 500", rs.filter((x) => !(x.ok && x.status < 500)).map((x) => JSON.stringify(x)));
  ok(ganhos(rs) === 1, "uma ativação só", rs.map((x) => x.mensagem));
  ok((await escalar("SELECT COUNT(*) FROM DistritoPeriodos WHERE DistritoId = @d", { d: dA })) === 1, "um período só");
  ok((await escalar("SELECT COUNT(*) FROM OrgaosLocais WHERE Nivel = 5 AND ReferenciaId = @d AND Sigla = N'CDE'", { d: dA })) === 1, "um CDE só");

  console.log("== o decreto de um Distrito junto com a intervenção em outro ==");
  rs = await disparar([{ acao: "ativar", corpo: ativ(dB) }, { acao: "intervir", quem: "PRES", corpo: { distritoId: dA, motivo: "OUTRA", fundamentacao: "Intervenção nas corridas dos Distritos.", interventorMembroId: 9605 } }]);
  ok(semErro(rs) && ganhos(rs) === 2, "os dois passam (a trava enfileira, sem travamento cruzado)", rs.map((x) => `${x.status} ${x.mensagem}`));
  ok((await escalar("SELECT COUNT(*) FROM DistritoIntervencoes WHERE DistritoId = @d AND EncerradaEm IS NULL", { d: dA })) === 1, "a intervenção ficou aberta");
  await q("UPDATE DistritoIntervencoes SET EncerradaEm = @h, EncerradaPor = 1001, Resultado = N'Encerrada para a corrida seguinte.' WHERE DistritoId = @d", { d: dA, h: hojeBr() });

  console.log("== quatro intervenções no mesmo Distrito ==");
  rs = await disparar([9605, 9606, 9607, 9608].map((m) => ({ acao: "intervir", quem: "PRES", corpo: { distritoId: dB, motivo: "RETENCAO_REPASSE", fundamentacao: "Retenção da cota nas corridas.", interventorMembroId: m } })));
  ok(semErro(rs) && ganhos(rs) === 1, "uma intervenção só", rs.map((x) => `${x.status} ${x.mensagem}`));
  ok((await escalar("SELECT COUNT(*) FROM DistritoIntervencoes WHERE DistritoId = @d AND EncerradaEm IS NULL", { d: dB })) === 1, "uma aberta");

  console.log("== a intervenção junto com a desativação ==");
  await q("UPDATE DistritoIntervencoes SET EncerradaEm = @h, EncerradaPor = 1001, Resultado = N'Encerrada para a corrida seguinte.' WHERE DistritoId = @d", { d: dB, h: hojeBr() });
  rs = await disparar([{ acao: "intervir", quem: "PRES", corpo: { distritoId: dB, motivo: "OUTRA", fundamentacao: "Intervenção nas corridas dos Distritos.", interventorMembroId: 9605 } },
    { acao: "desativar", corpo: { distritoId: dB, sessaoId: cli, motivo: "Desativação nas corridas dos Distritos." } }]);
  ok(semErro(rs) && ganhos(rs) === 1, "só um dos dois atos passa", rs.map((x) => `${x.status} ${x.mensagem}`));
  const ativoB = await escalar("SELECT Ativo FROM Distritos WHERE DistritoId = @d", { d: dB });
  const abertaB = await escalar("SELECT COUNT(*) FROM DistritoIntervencoes WHERE DistritoId = @d AND EncerradaEm IS NULL", { d: dB });
  ok((ativoB === true && abertaB === 1) || (ativoB === false && abertaB === 0), "nunca um Distrito desativado com intervenção aberta", [ativoB, abertaB]);

  console.log("== quatro registros do mesmo Dízimo Institucional ==");
  const mes = hojeBr().slice(0, 7);
  for (const c of [central, vila]) {
    await q(`INSERT INTO FechamentosTesouraria (CongregacaoId, MesReferencia, TotalRecebido, TotalFinal, PercentualRetencaoLocal, ValorRetidoLocal, ValorRepasseGeral, Status, FechadoPor, RepasseDistritoId)
             VALUES (@c, @m, 1000, 1000, 40, 400, 600, 'REPASSADO', 1002, @d)`, { c, m: mes, d: dA });
  }
  rs = await disparar([1, 2, 3, 4].map(() => ({ rota: "repasse", corpo: { origemTipo: "DISTRITO", origemId: dA, mesReferencia: mes } })));
  ok(semErro(rs) && ganhos(rs) === 1, "um registro só (os outros: 'já existe', sem erro 500)", rs.map((x) => `${x.status} ${x.mensagem}`));
  ok((await escalar("SELECT COUNT(*) FROM RepassesInstitucionais WHERE OrigemTipo = N'DISTRITO' AND OrigemId = @d AND MesReferencia = @m", { d: dA, m: mes })) === 1, "uma linha");

  console.log("== quatro envios do mesmo balanço ==");
  const anoPassado = Number(hojeBr().slice(0, 4)) - 1;
  await q("UPDATE DistritoPeriodos SET FinanceiroDesdeMes = @m WHERE DistritoId = @d AND DesativadoEm IS NULL", { m: `${anoPassado}-06`, d: dA });
  // a Tesoureira foi destituída pela intervenção da corrida acima: volta ao cargo para enviar
  await q("UPDATE Lideranca SET AtivoAte = NULL WHERE MembroId = 9603");
  const bal = { distritoId: dA, ano: anoPassado, receitas: 1000, despesas: 900, saldoFinal: 100 };
  rs = await disparar([1, 2, 3, 4].map(() => ({ acao: "balanco", quem: "TES", corpo: bal })));
  ok(semErro(rs) && ganhos(rs) === 1, "um balanço só", rs.map((x) => `${x.status} ${x.mensagem}`));
  ok((await escalar("SELECT COUNT(*) FROM DistritoBalancos WHERE DistritoId = @d AND Ano = @a", { d: dA, a: anoPassado })) === 1, "uma versão");
  const bId = await escalar("SELECT BalancoId FROM DistritoBalancos WHERE DistritoId = @d AND Ano = @a", { d: dA, a: anoPassado });

  console.log("== quatro análises do mesmo balanço ==");
  rs = await disparar([{ decisao: "APROVAR" }, { decisao: "DEVOLVER", motivo: "Devolvido na corrida." }, { decisao: "APROVAR" }, { decisao: "DEVOLVER", motivo: "Devolvido na corrida." }]
    .map((c) => ({ acao: "analisar", quem: "NIF", corpo: { balancoId: bId, ...c } })));
  ok(semErro(rs) && ganhos(rs) === 1, "uma análise só", rs.map((x) => `${x.status} ${x.mensagem}`));
  ok(["APROVADO", "DEVOLVIDO"].includes(await escalar("SELECT Status FROM DistritoBalancos WHERE BalancoId = @b", { b: bId })), "o balanço tem uma situação final");

  console.log("== o decreto junto com o fechamento do Rateio Geral (Trava 9-A) ==");
  // um fechamento do mês, já liberado e fora de um Rateio, numa congregação do território de um Distrito ainda inativo: o decreto o passa ao Distrito e o Rateio
  // o levaria para a Sede — os dois ao mesmo tempo, o fechamento fica num lado só
  const area3 = await escalar("INSERT INTO Areas (Nome) OUTPUT INSERTED.AreaId VALUES (N'Área Corrida C E2E')");
  const dC = await novo("Distrito Corrida C E2E", area3);
  const congC = await escalar("INSERT INTO Congregacoes (Nome, AreaId) OUTPUT INSERTED.CongregacaoId VALUES (N'Congregação Corrida C E2E', @a)", { a: area3 });
  const fC = await escalar(`INSERT INTO FechamentosTesouraria (CongregacaoId, MesReferencia, TotalRecebido, TotalFinal, PercentualRetencaoLocal, ValorRetidoLocal, ValorRepasseGeral, Status, FechadoPor)
           OUTPUT INSERTED.FechamentoId VALUES (@c, @m, 1000, 1000, 40, 400, 600, 'REPASSADO', 1002)`, { c: congC, m: mes });
  rs = await disparar([{ acao: "ativar", corpo: ativ(dC) }, { rota: "rateio", corpo: { mesReferencia: mes } }]);
  ok(semErro(rs), "nenhum erro 500", rs.map((x) => `${x.status} ${x.mensagem}`));
  const noRateio = await escalar("SELECT COUNT(*) FROM RateioGeralItens WHERE FechamentoId = @f", { f: fC });
  const doDistrito = await escalar("SELECT RepasseDistritoId FROM FechamentosTesouraria WHERE FechamentoId = @f", { f: fC });
  ok(!(noRateio > 0 && doDistrito), "o fechamento não ficou ao mesmo tempo no Rateio da Sede e no Distrito (o dinheiro não conta duas vezes)", { noRateio, doDistrito });

  fim(`e2e-74 distritos: corridas${process.env.E2E_RCSI === "1" ? " (READ_COMMITTED_SNAPSHOT)" : ""}`);
}

if (process.argv[2] === "filho") filho();
else principal().catch((e) => { console.log("ERRO", e && e.stack); process.exit(1); });
