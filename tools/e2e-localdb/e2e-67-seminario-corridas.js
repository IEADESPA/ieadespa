// e2e-67-seminario-corridas.js — v8.7 (Seminário): corridas de verdade (N processos node, cada um com a sua conexão ao SQL Server) sobre a base "cenario-escada".
// Quatro matrículas da mesma pessoa no mesmo curso: uma. Quatro inscrições da mesma pessoa em quatro turmas abertas da mesma disciplina: uma. Dois pré-requisitos cruzados
// ao mesmo tempo (A exige B e B exige A): nunca os dois (sem ciclo). Quatro aproveitamentos deferidos da mesma disciplina: um. Quatro conclusões do mesmo curso: um
// diploma. Quatro históricos escolares no mesmo dia: um documento. Nenhuma 500.
// Cada processo filho roda este mesmo arquivo com o primeiro argumento "filho".
process.env.AUTH_SECRET = "segredo-das-corridas-do-seminario-" + "x".repeat(24);
const { spawn } = require("child_process");
const L = require("./lib");
const { path } = L;

async function filho() {
  const spec = JSON.parse(process.argv[3]);
  const E = require("./lib-escada");
  await L.obterPool();
  const espera = spec.t0 - Date.now();
  if (espera > 0) await new Promise((r) => setTimeout(r, espera));
  try {
    const token = spec.membro ? L.sessao(spec.membro, { via: "SENHA", fator: { via: "CHAVE", em: Date.now() } }) : L.GERAL(1002, ["afm", "pessoas"]);
    const res = await E.chamarRota("GestaoSeminario/index.js", { metodo: "POST", binding: { acao: spec.acao }, token, corpo: spec.corpo || {} });
    const b = res.body || {};
    process.stdout.write("@@RESULTADO@@" + JSON.stringify({ ok: true, status: res.status, sucesso: b.sucesso, mensagem: b.mensagem, resultados: b.resultados, certificadoId: b.certificadoId }) + "\n");
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
  const { ok, fim, escalar, hojeBr, GERAL } = L;
  const E = require("./lib-escada");
  const { P } = E;
  const pool = await L.obterPool();
  await E.montarCenario();
  const ano = Number(hojeBr().slice(0, 4));
  const afmDb = require(path.join(L.API, "shared/afmDb.js"));
  await afmDb.nomearReitor(pool, { membroId: P.pastor1, dataInicio: `${ano}-01-10`, titulacao: "Mestre em Teologia", por: 1002 });
  await afmDb.cadastrarDocente(pool, { membroId: P.pastor2, titulacao: "Bacharel em Teologia", dataInicio: "2025-01-01", por: 1002 });
  const sem = (acao, corpo) => E.chamarRota("GestaoSeminario/index.js", { metodo: "POST", binding: { acao }, token: GERAL(1002, ["afm", "pessoas"]), corpo });
  const basico = await escalar("SELECT CursoId FROM AFMCursos WHERE Nivel = 'BASICO'");
  const A = (await sem("disciplina", { cursoId: basico, nome: "Corrida A E2E", area: "TEOLOGIA", cargaHoraria: 10, obrigatoria: true })).body.disciplinaId;
  const B = (await sem("disciplina", { cursoId: basico, nome: "Corrida B E2E", area: "TEOLOGIA", cargaHoraria: 10, obrigatoria: false })).body.disciplinaId;

  console.log("== quatro matrículas da mesma pessoa no mesmo curso ==");
  let rs = await disparar([1, 2, 3, 4].map(() => ({ acao: "matricular-curso", corpo: { membroId: P.auxiliar, cursoId: basico } })));
  ok(semErro(rs), "nenhum erro", rs);
  ok((await escalar("SELECT COUNT(*) FROM AFMCursoMatriculas WHERE MembroId = @m AND CursoId = @c", { m: P.auxiliar, c: basico })) === 1
    && rs.filter((r) => r.status === 201).length === 1 && rs.filter((r) => r.status === 409).length === 3, "uma matrícula; as outras: 409", rs.map((r) => r.status));

  console.log("== quatro inscrições da mesma pessoa em quatro turmas da mesma disciplina ==");
  const turmas = [];
  for (let i = 0; i < 4; i++) turmas.push((await sem("turma", { disciplinaId: A, docenteMembroId: P.pastor2, dataInicio: `${ano}-02-01`, dataFim: `${ano}-06-30` })).body.turmaId);
  rs = await disparar(turmas.map((turmaId) => ({ acao: "inscrever", corpo: { turmaId, membroIds: [P.auxiliar] } })));
  ok(semErro(rs), "nenhum erro", rs);
  ok((await escalar(`SELECT COUNT(*) FROM AFMTurmaAlunos WHERE MembroId = @m AND Situacao = 'INSCRITO' AND TurmaId IN (${turmas.join(",")})`, { m: P.auxiliar })) === 1
    && rs.filter((r) => r.resultados && r.resultados[0].sucesso).length === 1, "inscrito em uma só", rs.map((r) => r.resultados && r.resultados[0].mensagem));

  console.log("== pré-requisitos cruzados ao mesmo tempo ==");
  rs = await disparar([{ acao: "disciplina", corpo: { disciplinaId: A, cursoId: basico, nome: "Corrida A E2E", area: "TEOLOGIA", cargaHoraria: 10, obrigatoria: true, preRequisitos: [B] } },
    { acao: "disciplina", corpo: { disciplinaId: B, cursoId: basico, nome: "Corrida B E2E", area: "TEOLOGIA", cargaHoraria: 10, obrigatoria: false, preRequisitos: [A] } }]);
  ok(semErro(rs), "nenhum erro", rs);
  ok((await escalar("SELECT COUNT(*) FROM AFMDisciplinaPreRequisitos WHERE (DisciplinaId = @a AND PreRequisitoId = @b) OR (DisciplinaId = @b AND PreRequisitoId = @a)", { a: A, b: B })) === 1
    && rs.filter((r) => r.status === 200).length === 1, "um fica, o outro é recusado (sem ciclo)", rs.map((r) => [r.status, r.mensagem]));

  console.log("== quatro aproveitamentos deferidos da mesma disciplina ==");
  const C = (await sem("disciplina", { cursoId: basico, nome: "Corrida C E2E", area: "LIDERANCA", cargaHoraria: 8, obrigatoria: false })).body.disciplinaId;
  rs = await disparar([1, 2, 3, 4].map((i) => ({ acao: "aproveitamento", corpo: { membroId: P.auxiliar, disciplinaId: C, instituicao: `Instituto ${i} E2E`, disciplinaOrigem: "Liderança",
    cargaHorariaOrigem: 20, anoOrigem: 2020, decisao: "DEFERIDO", parecer: "Conteúdo equivalente ao da disciplina da AFM (e2e).", pareceristaMembroId: P.pastor1, dataParecer: hojeBr(), documentoConferido: true } })));
  ok(semErro(rs), "nenhum erro", rs);
  ok((await escalar("SELECT COUNT(*) FROM AFMAproveitamentos WHERE MembroId = @m AND DisciplinaId = @d AND Decisao = 'DEFERIDO'", { m: P.auxiliar, d: C })) === 1, "um deferido", rs.map((r) => [r.status, r.mensagem]));

  console.log("== quatro conclusões do mesmo curso ==");
  const tA = await escalar(`SELECT TurmaId FROM AFMTurmaAlunos WHERE MembroId = @m AND Situacao = 'INSCRITO' AND TurmaId IN (${turmas.join(",")})`, { m: P.auxiliar });
  await sem("notas", { turmaId: tA, itens: [{ membroId: P.auxiliar, nota: 9, horasPresentes: 10 }] });
  await sem("encerrar", { turmaId: tA });
  const cm = await escalar("SELECT CursoMatriculaId FROM AFMCursoMatriculas WHERE MembroId = @m AND CursoId = @c", { m: P.auxiliar, c: basico });
  rs = await disparar([1, 2, 3, 4].map(() => ({ acao: "concluir-curso", corpo: { cursoMatriculaId: cm } })));
  ok(semErro(rs), "nenhum erro", rs);
  ok(rs.filter((r) => r.status === 200).length === 1 && (await escalar("SELECT COUNT(*) FROM CertificadosEmitidos WHERE MembroId = @m AND Natureza = 'DIPLOMA_AFM'", { m: P.auxiliar })) === 1,
    "uma conclusão, um diploma", rs.map((r) => [r.status, r.mensagem]));

  console.log("== quatro históricos escolares no mesmo dia ==");
  rs = await disparar([1, 2, 3, 4].map(() => ({ acao: "documento", membro: P.auxiliar, corpo: { tipo: "HISTORICO" } })));
  ok(semErro(rs) && rs.every((r) => r.status === 201), "nenhum erro", rs);
  ok(new Set(rs.map((r) => r.certificadoId)).size === 1 && (await escalar("SELECT COUNT(*) FROM CertificadosEmitidos WHERE MembroId = @m AND Natureza = 'HISTORICO'", { m: P.auxiliar })) === 1,
    "um documento só (os outros recebem o mesmo)", rs.map((r) => r.certificadoId));

  fim("e2e-67 seminário (corridas)");
}

if (process.argv[2] === "filho") filho();
else principal().catch((e) => { console.log("ERRO", e); process.exit(1); });
