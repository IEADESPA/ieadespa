// e2e-53-escada-corridas.js — v8.2 (Escada ministerial): corridas de verdade (N processos node, cada um com a sua conexão ao SQL Server) sobre a base "cenario-escada".
// Quatro protocolos da mesma pessoa ao mesmo tempo: um processo; quatro envios ao CEI: um; quatro registros da mesma cerimônia (v8.3): uma conclusão, um cargo, uma linha
// aberta no histórico, um diploma; dois vetos e dois registros da cerimônia da mesma indicação: ou vetado e o cargo não muda, ou concluído e sem veto — nunca os dois;
// quatro "no cargo desde" diferentes ao mesmo tempo: uma
// linha aberta; quatro matrículas do mesmo candidato: uma; quatro CHM ao mesmo tempo: um estado só; quatro trocas de cargo pelo cadastro: uma linha aberta, do cargo final.
// Cada processo filho roda este mesmo arquivo com o primeiro argumento "filho".
process.env.AUTH_SECRET = "segredo-das-corridas-da-escada-" + "x".repeat(24);
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
    if (spec.tipo === "protocolar") res = await E.protocolar(spec.corpo);
    else if (spec.tipo === "avancar") res = await E.evoluir(spec.id, "AVANCAR");
    else if (spec.tipo === "registrar") res = await E.cerimonias("registrar", spec.corpo);   // v8.3: a conclusão é o registro da cerimônia
    else if (spec.tipo === "pessoa") res = await E.salvarPessoa(spec.membroId, spec.mudancas);
    else res = await E.afmPost(spec.tipo, spec.corpo);
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
  const { ok, fim, q, um, escalar, hojeBr } = L;
  const E = require("./lib-escada");
  const { P, TIPO } = E;
  await L.obterPool();
  const hoje = hojeBr();
  await E.montarCenario();
  const aberta = (m) => q("SELECT Cargo, CONVERT(varchar(10), Desde, 120) AS Desde FROM CargosMinisteriaisHistorico WHERE MembroId = @m AND Ate IS NULL", { m });

  console.log("== quatro protocolos da mesma pessoa ==");
  let rs = await disparar(Array.from({ length: 4 }, () => ({ tipo: "protocolar", corpo: { membroId: P.missionario, assunto: TIPO.DIACONO, proponenteMembroId: 1002 } })));
  ok(semErro(rs), "nenhum erro", rs);
  ok(rs.filter((x) => x.status === 201).length === 1 && rs.filter((x) => x.status === 409).length === 3, "um protocolo (201) e três 409", rs.map((x) => x.status));
  ok((await escalar("SELECT COUNT(*) FROM Consagracoes WHERE MembroId = @m AND Status IN ('PROTOCOLADO','EM_ANALISE_CONSELHO','AGUARDANDO_PLENARIO')", { m: P.missionario })) === 1, "um processo em andamento");

  console.log("== quatro 'enviar ao CEI' do mesmo processo ==");
  const idM = await escalar("SELECT ConsagracaoId FROM Consagracoes WHERE MembroId = @m AND Status = 'PROTOCOLADO'", { m: P.missionario });
  rs = await disparar(Array.from({ length: 4 }, () => ({ tipo: "avancar", id: idM })));
  ok(semErro(rs), "nenhum erro", rs);
  ok(rs.filter((x) => x.sucesso === true).length === 1 && (await E.statusDe(idM)) === "EM_ANALISE_CONSELHO", "um envio", rs.map((x) => [x.status, x.sucesso]));

  console.log("== quatro registros da mesma cerimônia (a conclusão da v8.3) ==");
  await E.parecer(idM); await E.homologar(idM); await E.pagarTaxa(idM);
  const ceM = await E.novaCerimonia();
  await E.cerimonias("incluir", { cerimoniaId: ceM, ids: [idM] });
  rs = await disparar(Array.from({ length: 4 }, () => ({ tipo: "registrar", corpo: { cerimoniaId: ceM, presentes: [idM], ausentes: [] } })));
  ok(semErro(rs), "nenhum erro", rs);
  ok(rs.filter((x) => x.sucesso === true).length === 1, "uma conclusão", rs.map((x) => [x.status, x.sucesso]));
  ok((await escalar("SELECT COUNT(*) FROM CertificadosEmitidos WHERE MembroId = @m AND Natureza = 'DIPLOMA'", { m: P.missionario })) === 1, "um diploma");
  ok((await escalar("SELECT CargoMinisterial FROM MembroReferencia WHERE MembroId = @m", { m: P.missionario })) === "DIACONO", "cargo DIACONO");
  let h = await aberta(P.missionario);
  ok(h.length === 1 && h[0].Cargo === "DIACONO" && h[0].Desde === hoje, "uma linha aberta (Diácono, hoje)", h);
  ok((await escalar("SELECT COUNT(*) FROM CargosMinisteriaisHistorico WHERE MembroId = @m AND Cargo = 'MISSIONARIO' AND Ate IS NOT NULL", { m: P.missionario })) === 1, "a de Missionário fechou uma vez");

  console.log("== dois vetos e dois registros da cerimônia da mesma indicação ==");
  let r = await E.protocolar({ membroId: P.vetado, assunto: TIPO.MISSIONARIO, proponenteMembroId: 1002 });
  const idV = r.body.consagracao.consagracaoId;
  await E.evoluir(idV, "AVANCAR"); await E.parecer(idV); await E.homologar(idV); await E.pagarTaxa(idV);
  const ceV = await E.novaCerimonia();
  await E.cerimonias("incluir", { cerimoniaId: ceV, ids: [idV] });
  rs = await disparar([
    { tipo: "vetar", corpo: { consagracaoId: idV, motivo: "Reprovou na avaliação regimental (corrida)" } },
    { tipo: "registrar", corpo: { cerimoniaId: ceV, presentes: [idV], ausentes: [] } },
    { tipo: "vetar", corpo: { consagracaoId: idV, motivo: "Reprovou na avaliação regimental (corrida)" } },
    { tipo: "registrar", corpo: { cerimoniaId: ceV, presentes: [idV], ausentes: [] } }
  ]);
  ok(semErro(rs), "nenhum erro", rs);
  const cv = await um("SELECT Status, VetoAFMEm FROM Consagracoes WHERE ConsagracaoId = @id", { id: idV });
  const cargoV = await escalar("SELECT CargoMinisterial FROM MembroReferencia WHERE MembroId = @m", { m: P.vetado });
  const coerente = (cv.Status === "REPROVADO" && cv.VetoAFMEm && cargoV === "AUXILIAR") || (cv.Status === "CONCLUIDO" && !cv.VetoAFMEm && cargoV === "MISSIONARIO");
  ok(coerente, "ou vetado (e o cargo não mudou) ou concluído (e sem veto) — nunca os dois", { cv, cargoV, rs: rs.map((x) => [x.status, x.sucesso]) });
  ok(rs.filter((x) => x.sucesso === true).length === 1, "só uma das quatro venceu", rs.map((x) => [x.status, x.sucesso]));
  h = await aberta(P.vetado);
  ok(h.length === 1 && h[0].Cargo === cargoV, "uma linha aberta, do cargo que ficou", h);

  console.log("== quatro 'no cargo desde' ao mesmo tempo ==");
  const datas = ["2019-01-01", "2019-02-01", "2019-03-01", "2019-04-01"];
  rs = await disparar(datas.map((d) => ({ tipo: "pessoa", membroId: P.legado, mudancas: { cargoDesde: d } })));
  ok(semErro(rs), "nenhum erro", rs);
  h = await aberta(P.legado);
  ok(h.length === 1 && h[0].Cargo === "DIACONO" && datas.includes(h[0].Desde), "uma linha aberta com uma das datas", h);
  ok((await escalar("SELECT COUNT(*) FROM CargosMinisteriaisHistorico WHERE MembroId = @m", { m: P.legado })) === 1, "nenhuma linha a mais");

  console.log("== quatro trocas de cargo pelo cadastro ==");
  rs = await disparar(["AUXILIAR", "MISSIONARIO", "DIACONO", "AUXILIAR"].map((c) => ({ tipo: "pessoa", membroId: P.menor, mudancas: { cargoMinisterial: c } })));
  ok(semErro(rs), "nenhum erro", rs);
  const cargoFinal = await escalar("SELECT CargoMinisterial FROM MembroReferencia WHERE MembroId = @m", { m: P.menor });
  h = await aberta(P.menor);
  ok(h.length <= 1, "no máximo uma linha aberta", h);
  // a linha aberta, se existe e é de outro cargo, a escada a ignora (mostra "data não informada"): nunca presume
  const E2 = require(path.join(L.API, "shared/escadaDb.js"));
  const dados = await E2.dadosDaPessoa(await L.obterPool(), P.menor);
  ok(dados.cargoAtual === cargoFinal && (h.length === 0 || h[0].Cargo === cargoFinal || dados.cargoDesde === null), "a escada lê o cargo final e nunca uma data de outro cargo", { cargoFinal, h, dados: { cargoAtual: dados.cargoAtual, cargoDesde: dados.cargoDesde } });

  console.log("== quatro matrículas do mesmo candidato; quatro CHM ==");
  rs = await disparar(Array.from({ length: 4 }, () => ({ tipo: "matricular-candidato", corpo: { membroId: P.candidato, nivel: "BASICO", data: hoje } })));
  ok(semErro(rs), "nenhum erro", rs);
  ok((await escalar("SELECT COUNT(*) FROM Matriculas_AFM WHERE MembroId = @m", { m: P.candidato })) === 1 && rs.filter((x) => x.sucesso === true).length === 1, "uma matrícula", rs.map((x) => [x.status, x.sucesso]));
  rs = await disparar([true, false, true, false].map((conceder) => ({ tipo: "chm", corpo: { membroId: P.candidato, conceder, data: hoje } })));
  ok(semErro(rs), "nenhum erro", rs);
  const chm = await um("SELECT CertificadoHabilitacao AS c, CHMEm AS em, CHMPor AS por FROM Matriculas_AFM WHERE MembroId = @m", { m: P.candidato });
  ok((chm.c === true && chm.em && chm.por === 1002) || (chm.c === false && !chm.em && !chm.por), "o CHM fica num estado só (concedido com data e autor, ou revogado sem nada)", chm);

  fim("e2e-53 escada (corridas)");
}

if (process.argv[2] === "filho") filho();
else principal().catch((e) => { console.log("ERRO", e); process.exit(1); });
