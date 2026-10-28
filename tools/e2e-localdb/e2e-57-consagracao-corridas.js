// e2e-57-consagracao-corridas.js — v8.3 (Consagração e documentação): corridas de verdade (N processos node, cada um com a sua conexão ao SQL Server) sobre a base
// "cenario-escada". Quatro pareceres (APTO e INAPTO) ao mesmo tempo: um parecer e a etapa dele; quatro homologações: uma; o mesmo processo em duas cerimônias ao mesmo
// tempo: em uma só; registrar, cancelar e retirar a mesma cerimônia ao mesmo tempo: um desfecho coerente; quatro impressões dos diplomas: um código por pessoa; quatro CHM
// concedidos ao mesmo tempo: um documento válido, o que a matrícula aponta.
// Cada processo filho roda este mesmo arquivo com o primeiro argumento "filho".
process.env.AUTH_SECRET = "segredo-das-corridas-da-consagracao-" + "x".repeat(24);
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
    if (spec.tipo === "parecer" || spec.tipo === "homologar") res = await E.esteira(spec.tipo, spec.corpo);
    else if (spec.tipo === "diplomas") res = await E.cerimonias("diplomas", undefined, undefined, "GET", { cerimoniaId: spec.cerimoniaId });
    else if (spec.tipo === "chm") res = await E.afmPost("chm", spec.corpo);
    else res = await E.cerimonias(spec.tipo, spec.corpo);
    const b = Buffer.isBuffer(res.body) ? { sucesso: res.status === 200, pdf: res.body.slice(0, 5).toString() === "%PDF-" } : res.body || {};
    process.stdout.write("@@RESULTADO@@" + JSON.stringify({ ok: true, status: res.status, sucesso: b.sucesso, mensagem: b.mensagem, pdf: b.pdf }) + "\n");
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
const placar = (rs) => rs.map((x) => [x.status, x.sucesso]);

async function principal() {
  const { ok, fim, q, um, escalar, hojeBr } = L;
  const E = require("./lib-escada");
  const { P, TIPO } = E;
  await L.obterPool();
  const hoje = hojeBr();
  await E.montarCenario();
  const id = (r) => r.body.consagracao.consagracaoId;
  const cargo = (m) => escalar("SELECT CargoMinisterial FROM MembroReferencia WHERE MembroId = @m", { m });

  console.log("== quatro pareceres ao mesmo tempo (dois APTO, dois INAPTO) ==");
  let r = await E.protocolar({ membroId: P.auxiliar, assunto: TIPO.MISSIONARIO, proponenteMembroId: 1002 });
  const idA = id(r);
  await E.evoluir(idA, "AVANCAR");
  const corpoParecer = (resultado) => ({ consagracaoId: idA, ...E.PARECER_APTO, resultado, sabatinaEm: hoje, fundamentacao: `Parecer ${resultado} da corrida (e2e).` });
  let rs = await disparar(["APTO", "INAPTO", "APTO", "INAPTO"].map((res) => ({ tipo: "parecer", corpo: corpoParecer(res) })));
  ok(semErro(rs), "nenhum erro", rs);
  ok(rs.filter((x) => x.sucesso === true).length === 1, "um parecer venceu", placar(rs));
  const pa = await um("SELECT p.Resultado, c.Status, c.MotivoEncerramento FROM PareceresCEIConsagracao p JOIN Consagracoes c ON c.ConsagracaoId = p.ConsagracaoId WHERE p.ConsagracaoId = @id", { id: idA });
  ok((await escalar("SELECT COUNT(*) FROM PareceresCEIConsagracao WHERE ConsagracaoId = @id", { id: idA })) === 1, "uma linha de parecer");
  ok((pa.Resultado === "APTO" && pa.Status === "AGUARDANDO_PLENARIO" && !pa.MotivoEncerramento) || (pa.Resultado === "INAPTO" && pa.Status === "REPROVADO" && pa.MotivoEncerramento === "INAPTO_CEI"), "a etapa é a do parecer que ficou", pa);

  console.log("== quatro homologações do mesmo processo ==");
  r = await E.protocolar({ membroId: P.missionario, assunto: TIPO.DIACONO, proponenteMembroId: 1002 });
  const idB = id(r);
  await E.evoluir(idB, "AVANCAR"); await E.parecer(idB);
  rs = await disparar(Array.from({ length: 4 }, () => ({ tipo: "homologar", corpo: { ids: [idB], ato: "Lista validada (corrida)", data: hoje } })));
  ok(semErro(rs), "nenhum erro", rs);
  ok(rs.filter((x) => x.sucesso === true).length === 1 && (await E.statusDe(idB)) === "HOMOLOGADO", "uma homologação", placar(rs));
  await E.pagarTaxa(idB);

  console.log("== o mesmo processo em duas cerimônias ao mesmo tempo ==");
  const ce1 = await E.novaCerimonia();
  const ce2 = await E.novaCerimonia();
  rs = await disparar([ce1, ce2, ce1, ce2].map((c) => ({ tipo: "incluir", corpo: { cerimoniaId: c, ids: [idB] } })));
  ok(semErro(rs), "nenhum erro", rs);
  const onde = await escalar("SELECT CerimoniaId FROM Consagracoes WHERE ConsagracaoId = @id", { id: idB });
  ok(rs.filter((x) => x.sucesso === true).length === 1 && [ce1, ce2].includes(onde), "em uma cerimônia só", { placar: placar(rs), onde });
  const outra = onde === ce1 ? ce2 : ce1;

  console.log("== quatro impressões dos diplomas ==");
  r = await E.protocolar({ membroId: P.presbitero, assunto: TIPO.EVANGELISTA, proponenteMembroId: 1001, modalidade: "NOMEACAO_PRESIDENCIAL", atoReferencia: "Ato corrida" });
  const idC = id(r);
  await E.evoluir(idC, "AVANCAR"); await E.parecer(idC); await E.homologar(idC); await E.pagarTaxa(idC);
  await E.cerimonias("incluir", { cerimoniaId: onde, ids: [idC] });
  rs = await disparar(Array.from({ length: 4 }, () => ({ tipo: "diplomas", cerimoniaId: onde })));
  ok(semErro(rs) && rs.every((x) => x.pdf === true), "as quatro impressões saem", rs);
  const codigos = await q("SELECT DiplomaCodigo FROM Consagracoes WHERE ConsagracaoId IN (@a, @b)", { a: idB, b: idC });
  ok(codigos.length === 2 && codigos.every((c) => c.DiplomaCodigo) && codigos[0].DiplomaCodigo !== codigos[1].DiplomaCodigo, "um código por pessoa, diferentes entre si", codigos);

  console.log("== registrar, cancelar e retirar a mesma cerimônia ao mesmo tempo ==");
  const comissaoOk = await E.cerimonias("comissao", { cerimoniaId: outra, membroIds: E.COMISSAO });
  ok(comissaoOk.status === 200, "a outra cerimônia também tem comissão");
  rs = await disparar([
    { tipo: "registrar", corpo: { cerimoniaId: onde, presentes: [idB, idC], ausentes: [] } },
    { tipo: "cancelar", corpo: { cerimoniaId: onde, motivo: "Cancelada na corrida (e2e)" } },
    { tipo: "retirar", corpo: { cerimoniaId: onde, consagracaoId: idB } },
    { tipo: "registrar", corpo: { cerimoniaId: onde, presentes: [idB, idC], ausentes: [] } }
  ]);
  ok(semErro(rs), "nenhum erro", rs);
  const st = await escalar("SELECT Status FROM CerimoniasConsagracao WHERE CerimoniaId = @c", { c: onde });
  const b = await um("SELECT Status, CerimoniaId, DiplomaCertificadoId FROM Consagracoes WHERE ConsagracaoId = @id", { id: idB });
  const c = await um("SELECT Status, CerimoniaId, DiplomaCertificadoId FROM Consagracoes WHERE ConsagracaoId = @id", { id: idC });
  const cargoB = await cargo(P.missionario);
  const cargoC = await cargo(P.presbitero);
  const diplomas = await escalar("SELECT COUNT(*) FROM CertificadosEmitidos WHERE Natureza = 'DIPLOMA' AND MembroId IN (@a, @b)", { a: P.missionario, b: P.presbitero });
  const coerenteB = (b.Status === "CONCLUIDO" && cargoB === "DIACONO" && b.DiplomaCertificadoId) || (b.Status === "HOMOLOGADO" && cargoB === "MISSIONARIO" && !b.DiplomaCertificadoId && b.CerimoniaId === (st === "PLANEJADA" ? null : b.CerimoniaId));
  const coerenteC = (c.Status === "CONCLUIDO" && cargoC === "EVANGELISTA" && c.DiplomaCertificadoId) || (c.Status === "HOMOLOGADO" && cargoC === "PRESBITERO" && !c.DiplomaCertificadoId);
  ok(coerenteB && coerenteC, "cada candidato: consagrado (cargo e diploma) ou ainda homologado (nada mudou) — nunca meio a meio", { st, b, c, cargoB, cargoC });
  ok(st !== "REALIZADA" || (c.Status === "CONCLUIDO"), "se a cerimônia foi registrada, quem estava nela foi consagrado", { st, c });
  ok(st !== "CANCELADA" || (b.Status === "HOMOLOGADO" && c.Status === "HOMOLOGADO" && !b.CerimoniaId && !c.CerimoniaId), "se foi cancelada, ninguém foi consagrado e os dois voltaram para a fila", { st, b, c });
  ok(diplomas === [b, c].filter((x) => x.Status === "CONCLUIDO").length, "um diploma por consagrado", diplomas);
  ok(rs.filter((x) => x.sucesso === true && x.mensagem && /Cerimônia registrada/.test(x.mensagem)).length <= 1, "no máximo um registro venceu", placar(rs));

  console.log("== quatro CHM concedidos ao mesmo tempo ==");
  rs = await disparar(["2026-01-01", "2026-02-01", "2026-03-01", "2026-04-01"].map((data) => ({ tipo: "chm", corpo: { membroId: P.semSexo, conceder: true, data } })));
  ok(semErro(rs), "nenhum erro", rs);
  const validos = await q("SELECT CertificadoId FROM CertificadosEmitidos WHERE MembroId = @m AND Natureza = 'CHM' AND RevogadoEm IS NULL", { m: P.semSexo });
  const aponta = await escalar("SELECT CHMCertificadoId FROM Matriculas_AFM WHERE MembroId = @m", { m: P.semSexo });
  ok(validos.length === 1 && validos[0].CertificadoId === aponta, "um documento válido, o que a matrícula aponta", { validos, aponta });

  fim("e2e-57 consagração (corridas)");
}

if (process.argv[2] === "filho") filho();
else principal().catch((e) => { console.log("ERRO", e); process.exit(1); });
