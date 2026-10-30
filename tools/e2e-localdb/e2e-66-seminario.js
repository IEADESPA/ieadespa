// e2e-66-seminario.js — v8.7 (o Seminário como sistema acadêmico), com os handlers e o banco REAIS, sobre a base "cenario-escada" (a "preparar-escada" aplica a 163).
// O currículo (as disciplinas, os pré-requisitos sem ciclo, o aviso do Art. 70 §2º), a matrícula no curso (só com a matrícula ativa na AFM), a turma com o docente em
// exercício, a inscrição (pré-requisito, já aprovado, outra turma aberta, o docente), a nota e a frequência (o docente lança a própria turma; só a encerrada vale), reabrir,
// o aproveitamento com o parecer, a conclusão com o diploma (e a trava de quem já concluiu), anular a conclusão, a escada lendo o nível do histórico, o requisito de
// formação que exige uma disciplina, os documentos (declaração, histórico, diploma — PDF e verificação pública), o perfil, a minha, Meus Dados e lixo.
const L = require("./lib");
const { ok, fim, q, escalar, obterPool, hojeBr, path, API, GERAL, LIDER } = L;
const E = require("./lib-escada");
const { P, CENTRAL, chamarRota } = E;

console.error = () => { };
const req = (m) => require(path.join(API, m));
const MEMBRO = (m) => L.sessao(m, { via: "SENHA", fator: { via: "CHAVE", em: Date.now() } });
const AFM = () => GERAL(1002, ["afm", "pessoas", "consagracoes"]);
const sem = (acao, { metodo = "GET", token, corpo, query } = {}) => chamarRota("GestaoSeminario/index.js", { metodo, binding: { acao }, token: token === undefined ? AFM() : token || undefined, corpo, query });
const post = (acao, corpo, token) => sem(acao, { metodo: "POST", corpo, token });

(async () => {
  const pool = await obterPool();
  const hoje = hojeBr();
  const ano = Number(hoje.slice(0, 4));
  await E.montarCenario();
  const afmDb = req("shared/afmDb.js");

  console.log("== migração 163 ==");
  ok((await escalar(`SELECT COUNT(*) FROM sys.tables WHERE name IN ('AFMCursos','AFMDisciplinas','AFMDisciplinaPreRequisitos','AFMCursoMatriculas','AFMTurmas','AFMTurmaAlunos',
    'AFMAproveitamentos','AFMDisciplinaRequisitos','AFMDocumentosAcademicos')`)) === 9, "as nove tabelas");
  ok((await escalar("SELECT COUNT(*) FROM AFMCursos")) === 4, "os quatro cursos do Art. 72");
  ok(/DIPLOMA_AFM/.test(await escalar("SELECT definition FROM sys.check_constraints WHERE name = 'CK_CertificadosEmitidos_Natureza'")), "a natureza dos documentos acadêmicos");

  // o Corpo Docente: o Reitor (pastor1), um docente (pastor2) e um que já saiu (pastor3) — pelas funções da v8.1
  await afmDb.nomearReitor(pool, { membroId: P.pastor1, dataInicio: `${ano}-01-10`, titulacao: "Mestre em Teologia", por: 1002 });
  for (const m of [P.pastor2, P.pastor3]) await afmDb.cadastrarDocente(pool, { membroId: m, titulacao: "Bacharel em Teologia", dataInicio: "2025-01-01", por: 1002 });
  const cd3 = await escalar("SELECT CorpoDocenteId FROM AFMCorpoDocente WHERE MembroId = @m AND DataFim IS NULL", { m: P.pastor3 });
  await afmDb.encerrarCorpoDocente(pool, { corpoDocenteId: cd3, data: E.diasAtras(1), motivo: "Mudou de cidade (e2e)", por: 1002 });

  console.log("== quem pode o quê ==");
  ok((await sem("painel", { token: null })).status === 401, "sem sessão: 401");
  ok((await sem("acao-que-nao-existe", { token: null })).status === 401, "nem a ação desconhecida responde a quem não entrou");
  ok((await sem("painel", { token: LIDER(P.lider, ["afm"], [CENTRAL]) })).status === 403, "a AFM local não vê o painel");
  ok((await post("turma", { disciplinaId: 1, docenteMembroId: P.pastor2, dataInicio: hoje, dataFim: hoje }, GERAL(1002, ["pessoas"]))).status === 403, "o nível geral sem 'afm': 403");
  ok((await sem("minha", { token: MEMBRO(P.auxiliar) })).status === 200, "a própria pessoa vê o seu histórico");
  ok((await sem("acao-que-nao-existe")).status === 404, "ação desconhecida: 404");

  console.log("== o currículo ==");
  let r = await sem("painel");
  ok(r.status === 200 && r.body.cursos.length === 4 && r.body.cursos[0].nivel === "BASICO", "o painel: os quatro cursos, do Básico ao Bacharel", r.body);
  ok(r.body.cursos[0].lacunasGovernanca.length === 3, "Art. 70 §2º: o curso sem disciplina de governança é avisado");
  const curso = Object.fromEntries(r.body.cursos.map((c) => [c.nivel, c.cursoId]));
  const disc = async (corpo) => post("disciplina", { obrigatoria: true, ...corpo });
  r = await disc({ cursoId: curso.BASICO, nome: "Bibliologia E2E", area: "TEOLOGIA", cargaHoraria: "20" });
  ok(r.status === 201, "disciplina cadastrada", r.body);
  const bib = r.body.disciplinaId;
  const lit = (await disc({ cursoId: curso.BASICO, nome: "Liturgia E2E", area: "LITURGIA", cargaHoraria: "10", preRequisitos: [bib] })).body.disciplinaId;
  const lid = (await disc({ cursoId: curso.BASICO, nome: "Liderança E2E", area: "LIDERANCA", cargaHoraria: "8", obrigatoria: false })).body.disciplinaId;
  const hom = (await disc({ cursoId: curso.MEDIO, nome: "Homilética E2E", area: "TEOLOGIA", cargaHoraria: "12", preRequisitos: [lit] })).body.disciplinaId;
  ok(bib && lit && lid && hom, "quatro disciplinas (o pré-requisito pode ser de outro curso)");
  r = await disc({ disciplinaId: bib, cursoId: curso.BASICO, nome: "Bibliologia E2E", area: "TEOLOGIA", cargaHoraria: 20, preRequisitos: [hom] });
  ok(r.status === 422 && /ciclo/.test(r.body.mensagem), "o ciclo indireto (Bibliologia → Homilética → Liturgia → Bibliologia): recusado", r.body);
  ok((await disc({ cursoId: curso.BASICO, nome: "Liturgia E2E", area: "LITURGIA", cargaHoraria: 10 })).status === 409, "o nome repetido no mesmo curso: 409");
  ok((await disc({ disciplinaId: lit, cursoId: curso.MEDIO, nome: "Liturgia E2E", area: "LITURGIA", cargaHoraria: 10 })).status === 422, "a disciplina não muda de curso");
  ok((await disc({ cursoId: curso.BASICO, nome: "Errada E2E", area: "LITURGIA", cargaHoraria: 10, preRequisitos: [99999] })).status === 422, "o pré-requisito que não existe: recusado");
  ok((await post("curso", { cursoId: curso.BASICO, nome: "Nível Básico em Teologia", notaMinima: 11, frequenciaMinimaPct: 75 })).status === 400, "nota mínima acima de 10: 400");
  ok((await post("curso", { cursoId: curso.BASICO, nome: "Nível Básico em Teologia", notaMinima: "7,0", frequenciaMinimaPct: 75 })).status === 200, "o curso se corrige");
  ok((await post("curso", { cursoId: 99999, nome: "Inexistente", notaMinima: 7, frequenciaMinimaPct: 75 })).status === 404, "curso inexistente: 404");

  console.log("== a matrícula no curso ==");
  const matricular = (membroId, nivel, token) => post("matricular-curso", { membroId, cursoId: curso[nivel], data: `${ano}-01-15` }, token);
  r = await matricular(P.candidato, "BASICO");
  ok(r.status === 422 && /matrícula ativa na AFM/.test(r.body.mensagem), "quem não é oficial nem candidato matriculado: recusado", r.body);
  ok((await matricular(P.inativo, "BASICO")).status === 422, "a matrícula INATIVA na AFM: recusada");
  ok((await matricular(1002, "BASICO")).status === 422, "ninguém registra a própria matrícula");
  ok((await post("matricular-curso", { membroId: P.auxiliar, cursoId: curso.BASICO, data: `${ano + 1}-01-01` })).status === 422, "a data no futuro: recusada");
  ok((await matricular(P.auxiliar, "BASICO")).status === 201, "o Auxiliar no Básico");
  ok((await matricular(P.auxiliar, "BASICO")).status === 409, "de novo: 409");
  ok((await matricular(P.nomeado, "BASICO")).status === 201 && (await matricular(P.vetado, "BASICO")).status === 201, "mais dois no Básico");

  console.log("== a turma e a inscrição ==");
  const turma = (disciplinaId, docente, extra = {}) => post("turma", { disciplinaId, docenteMembroId: docente, dataInicio: `${ano}-02-01`, dataFim: `${ano}-06-30`, local: "Templo Central", ...extra });
  r = await turma(bib, P.pastor3);
  ok(r.status === 422 && /exercício/.test(r.body.mensagem), "o docente que saiu do Corpo Docente: recusado", r.body);
  ok((await turma(bib, P.lider)).status === 422, "quem não é do Corpo Docente: recusado");
  r = await turma(bib, P.pastor2);
  ok(r.status === 201, "a turma de Bibliologia com o docente", r.body);
  const tBib = r.body.turmaId;
  ok((await escalar("SELECT CargaHoraria FROM AFMTurmas WHERE TurmaId = @t", { t: tBib })) === 20, "a regra congelada: a carga da disciplina no dia");
  const tLit = (await turma(lit, P.pastor1)).body.turmaId;   // o Reitor também leciona
  r = await post("inscrever", { turmaId: tBib, membroIds: [P.auxiliar, P.nomeado, P.vetado, P.candidato, P.pastor2, 99999999, "1e3"] });
  const ins = new Map((r.body.resultados || []).map((x) => [x.membroId, x]));
  ok(r.status === 200 && ins.get(P.auxiliar).sucesso && ins.get(P.nomeado).sucesso && ins.get(P.vetado).sucesso, "três inscritos, um a um", r.body);
  ok(!ins.get(P.candidato).sucesso && /matriculado/.test(ins.get(P.candidato).mensagem), "fora do curso: recusado");
  ok(!ins.get(P.pastor2).sucesso && /docente/.test(ins.get(P.pastor2).mensagem), "o docente não é aluno da própria turma");
  ok(!ins.get(99999999).sucesso && !ins.get(null).sucesso, "matrícula inexistente e lixo: recusados");
  r = await post("inscrever", { turmaId: tLit, membroIds: [P.auxiliar] });
  ok(!r.body.resultados[0].sucesso && /pré-requisito/.test(r.body.resultados[0].mensagem), "Liturgia sem Bibliologia aprovada: falta o pré-requisito", r.body);
  const tBib2 = (await turma(bib, P.pastor1)).body.turmaId;
  r = await post("inscrever", { turmaId: tBib2, membroIds: [P.auxiliar] });
  ok(!r.body.resultados[0].sucesso && /outra turma aberta/.test(r.body.resultados[0].mensagem), "em outra turma aberta da mesma disciplina: recusado");
  ok((await post("excluir-turma", { turmaId: tBib })).status === 422, "a turma com inscritos não se exclui");
  ok((await post("excluir-turma", { turmaId: tBib2 })).status === 200, "a turma vazia se exclui");

  console.log("== a nota e a frequência (o docente na própria turma) ==");
  const DOC = MEMBRO(P.pastor2);
  ok((await sem("turma", { query: { turmaId: tBib }, token: DOC })).status === 200, "o docente vê a própria turma");
  ok((await sem("turma", { query: { turmaId: tBib }, token: MEMBRO(P.lider) })).status === 404, "outra pessoa: 404 (o mesmo da turma que não existe)");
  ok((await sem("turma", { query: { turmaId: tLit }, token: DOC })).status === 404, "nem o docente vê a turma de outro docente");
  r = await post("notas", { turmaId: tBib, itens: [{ membroId: P.auxiliar, nota: "8,5", horasPresentes: "18" }, { membroId: P.nomeado, nota: 6, horasPresentes: 20 },
    { membroId: P.vetado, nota: 9, horasPresentes: "14,5" }, { membroId: P.candidato, nota: 9, horasPresentes: 20 }, { membroId: P.auxiliar + 0, nota: 11, horasPresentes: 20 }] }, DOC);
  const nt = r.body.resultados || [];
  ok(r.status === 200 && nt[0].resultado === "APROVADO" && nt[1].resultado === "REPROVADO_NOTA" && nt[2].resultado === "REPROVADO_FREQ", "aprovado, reprovado por nota, reprovado por frequência (14,5 de 15 h)", r.body);
  ok(!nt[3].sucesso && !nt[4].sucesso, "quem não está inscrito e a nota 11: recusados");
  ok((await post("notas", { turmaId: tBib, itens: [{ membroId: P.auxiliar, nota: 8, horasPresentes: 18 }] }, MEMBRO(P.pastor3))).status === 404, "o docente que saiu não alcança a turma dos outros");
  let h = (await sem("minha", { token: MEMBRO(P.auxiliar) })).body;
  ok(h.turmas[0].nota === null && h.cursos[0].disciplinas.find((d) => d.disciplinaId === bib).estado === "CURSANDO", "com a turma aberta, a nota não aparece e a disciplina está 'cursando'", h.turmas);
  ok((await post("encerrar", { turmaId: tBib }, MEMBRO(P.lider))).status === 404, "quem não é o docente nem a Academia não encerra");
  r = await post("encerrar", { turmaId: tBib }, DOC);
  ok(r.status === 200, "o docente encerra a própria turma", r.body);
  ok((await post("encerrar", { turmaId: tBib }, DOC)).status === 409, "de novo: 409");
  r = await post("notas", { turmaId: tBib, itens: [{ membroId: P.nomeado, nota: 9, horasPresentes: 20 }] }, DOC);
  ok(!r.body.resultados[0].sucesso && /encerrada/.test(r.body.resultados[0].mensagem), "a turma encerrada não aceita nota");
  h = (await sem("minha", { token: MEMBRO(P.auxiliar) })).body;
  ok(h.turmas[0].nota === 8.5 && h.turmas[0].frequenciaPct === 90 && h.cursos[0].disciplinas.find((d) => d.disciplinaId === bib).estado === "APROVADA", "encerrada: a nota, a frequência (90%) e a disciplina aprovada", h.turmas[0]);
  ok((await post("reabrir", { turmaId: tBib }, DOC)).status === 403, "reabrir é do nível geral (o docente não)");
  ok((await post("reabrir", { turmaId: tBib, motivo: "curto" })).status === 400, "reabrir sem o motivo: 400");
  ok((await post("reabrir", { turmaId: tBib, motivo: "Nota do Diácono lançada errada (e2e)" })).status === 200, "reaberta com o motivo");
  r = await post("notas", { turmaId: tBib, itens: [{ membroId: P.nomeado, nota: "7,5", horasPresentes: 16 }] });
  ok(r.body.resultados[0].resultado === "APROVADO", "a Academia corrige a nota");
  // (revisão) reabrir não serve para apagar o que já valeu: a inscrição com nota não se cancela, a turma não se exclui
  r = await post("cancelar-inscricao", { turmaId: tBib, membroId: P.nomeado, motivo: "Tentativa de apagar a nota (e2e)" });
  ok(r.status === 422 && /histórico/.test(r.body.mensagem), "a turma já encerrada uma vez: a inscrição com nota não se cancela", r.body);
  ok((await post("excluir-turma", { turmaId: tBib })).status === 422, "nem a turma se exclui");
  ok((await post("encerrar", { turmaId: tBib })).status === 200, "e encerra de novo");
  r = await post("inscrever", { turmaId: tLit, membroIds: [1002] });
  ok(!r.body.resultados[0].sucesso && /a si mesmo/.test(r.body.resultados[0].mensagem), "ninguém inscreve a si mesmo");
  // reabrir não deixa ninguém em duas turmas abertas da mesma disciplina
  const tBib3 = (await turma(bib, P.pastor1)).body.turmaId;
  ok((await post("inscrever", { turmaId: tBib3, membroIds: [P.vetado] })).body.resultados[0].sucesso, "o reprovado por frequência entra numa turma nova de Bibliologia");
  r = await post("reabrir", { turmaId: tBib, motivo: "Conferir as notas de novo (e2e)" });
  ok(r.status === 422 && /duas turmas abertas/.test(r.body.mensagem), "reabrir a antiga o deixaria em duas turmas abertas: recusado", r.body);
  ok((await post("cancelar-inscricao", { turmaId: tBib3, membroId: P.vetado, motivo: "Desistiu da turma (e2e)" })).status === 200, "a inscrição sem nota (turma nunca encerrada) se cancela");
  ok((await post("excluir-turma", { turmaId: tBib3 })).status === 422, "a turma que já teve inscrito (mesmo cancelado) não se exclui");
  ok((await escalar("SELECT COUNT(*) FROM AuditLog WHERE Tabela = 'AFMTurmas' AND RegistroId = @t AND Acao IN ('AFM_TURMA_ENCERRADA','AFM_TURMA_REABERTA')", { t: tBib })) === 3, "encerrar e reabrir ficam na auditoria");

  console.log("== o aproveitamento ==");
  const apr = (corpo) => post("aproveitamento", { membroId: P.nomeado, disciplinaId: lid, instituicao: "Instituto Bíblico E2E", disciplinaOrigem: "Liderança Cristã", cargaHorariaOrigem: "30",
    anoOrigem: 2019, decisao: "DEFERIDO", parecer: "Conteúdo e carga horária equivalentes à disciplina de Liderança da AFM.", pareceristaMembroId: P.pastor1, dataParecer: hoje, documentoConferido: true, ...corpo });
  ok((await apr({ parecer: "ok" })).status === 400, "sem o parecer escrito: 400");
  ok((await apr({ documentoConferido: false })).status === 400, "deferir sem conferir o documento: 400");
  r = await apr({ pareceristaMembroId: P.lider });
  ok(r.status === 422 && /Corpo Docente/.test(r.body.mensagem), "parecer de quem não é do Corpo Docente: recusado", r.body);
  ok((await apr({ pareceristaMembroId: P.pastor3 })).status === 422, "nem de quem já saiu dele");
  r = await apr({});
  ok(r.status === 201, "deferido com o parecer do Reitor", r.body);
  const aprId = r.body.aproveitamentoId;
  ok((await apr({})).status === 409, "a mesma disciplina de novo: 409");
  ok((await apr({ membroId: 1002 })).status === 422, "ninguém registra o próprio aproveitamento");
  r = await post("inscrever", { turmaId: tLit, membroIds: [P.auxiliar] });
  ok(r.body.resultados[0].sucesso, "com Bibliologia aprovada, o Auxiliar entra em Liturgia");
  r = await apr({ membroId: P.auxiliar, disciplinaId: lit });
  ok(r.status === 422 && /turma aberta/.test(r.body.mensagem), "aproveitar a disciplina que está cursando: recusado", r.body);
  ok((await apr({ membroId: P.auxiliar, disciplinaId: lit, decisao: "INDEFERIDO", documentoConferido: false })).status === 201, "o indeferido também se registra, com o parecer");
  ok(!/Conteúdo e carga/.test(await escalar("SELECT TOP 1 DadosDepois FROM AuditLog WHERE Tabela = 'AFMAproveitamentos' ORDER BY AuditId DESC") || ""), "a auditoria guarda a decisão, não o parecer");

  console.log("== a conclusão e o diploma ==");
  const cmAux = await escalar("SELECT CursoMatriculaId FROM AFMCursoMatriculas WHERE MembroId = @m AND CursoId = @c", { m: P.auxiliar, c: curso.BASICO });
  const cmNom = await escalar("SELECT CursoMatriculaId FROM AFMCursoMatriculas WHERE MembroId = @m AND CursoId = @c", { m: P.nomeado, c: curso.BASICO });
  r = await post("concluir-curso", { cursoMatriculaId: cmNom });
  ok(r.status === 422 && /Liturgia E2E/.test(r.body.mensagem), "faltando uma obrigatória: recusado, com o nome dela", r.body);
  await post("notas", { turmaId: tLit, itens: [{ membroId: P.auxiliar, nota: 10, horasPresentes: 10 }] });
  r = await post("concluir-curso", { cursoMatriculaId: cmAux });
  ok(r.status === 422, "com Liturgia na turma ainda aberta: não conclui (só a encerrada vale)", r.body);
  ok((await post("encerrar", { turmaId: tLit })).status === 200, "Liturgia encerrada");
  r = await post("concluir-curso", { cursoMatriculaId: cmAux, data: `${ano}-01-20` });
  ok(r.status === 422 && /última obrigatória/.test(r.body.mensagem), "a conclusão com data antes da última obrigatória cumprida: recusada", r.body);
  ok(((await sem("painel")).body.prontos || []).some((x) => x.cursoMatriculaId === cmAux), "o painel mostra quem está pronto para concluir");
  ok((await post("concluir-curso", { cursoMatriculaId: cmAux, data: `${ano + 1}-01-01` })).status === 422, "a conclusão no futuro: recusada");
  r = await post("concluir-curso", { cursoMatriculaId: cmAux });
  ok(r.status === 200 && r.body.certificadoId && /código/.test(r.body.mensagem), "concluído, com o diploma", r.body);
  const diploma1 = r.body.certificadoId;
  ok((await post("concluir-curso", { cursoMatriculaId: cmAux })).status === 409, "de novo: 409");
  ok((await escalar("SELECT Natureza FROM CertificadosEmitidos WHERE CertificadoId = @c", { c: diploma1 })) === "DIPLOMA_AFM", "o diploma é documento verificável da AFM");
  // quem já concluiu com a disciplina não perde o "aprovado" (anule a conclusão antes)
  await post("reabrir", { turmaId: tBib, motivo: "Conferência das notas (e2e)" });
  r = await post("notas", { turmaId: tBib, itens: [{ membroId: P.auxiliar, nota: 3, horasPresentes: 18 }] });
  ok(!r.body.resultados[0].sucesso && /anule a conclusão/.test(r.body.resultados[0].mensagem), "a nota de quem concluiu não deixa de ser 'aprovado'", r.body);
  await post("encerrar", { turmaId: tBib });
  ok((await post("anular-conclusao", { cursoMatriculaId: cmAux })).status === 400, "anular sem o motivo: 400");
  r = await post("anular-conclusao", { cursoMatriculaId: cmAux, motivo: "Diploma emitido com a data errada (e2e)" });
  ok(r.status === 200 && (await escalar("SELECT CASE WHEN RevogadoEm IS NULL THEN 0 ELSE 1 END FROM CertificadosEmitidos WHERE CertificadoId = @c", { c: diploma1 })) === 1
    && (await escalar("SELECT Situacao FROM AFMCursoMatriculas WHERE CursoMatriculaId = @c", { c: cmAux })) === "CURSANDO", "anulada: o diploma revogado e o curso volta a 'cursando'", r.body);
  r = await post("concluir-curso", { cursoMatriculaId: cmAux });
  ok(r.status === 200 && r.body.certificadoId !== diploma1, "concluído de novo: diploma novo");
  const diploma = r.body.certificadoId;
  // o aproveitamento do curso concluído não se anula
  const lidAux = (await apr({ membroId: P.auxiliar, disciplinaId: lid })).body.aproveitamentoId;
  ok(lidAux, "o Auxiliar aproveita a optativa");
  ok((await post("anular-aproveitamento", { aproveitamentoId: lidAux, motivo: "Documento de origem falso (e2e)" })).status === 422, "o aproveitamento do curso já concluído: anule a conclusão antes");
  ok((await post("anular-aproveitamento", { aproveitamentoId: aprId, motivo: "Documento de origem conferido de novo (e2e)" })).status === 200, "o do curso em andamento se anula com o motivo");
  ok((await post("anular-aproveitamento", { aproveitamentoId: aprId, motivo: "Documento de origem conferido de novo (e2e)" })).status === 409, "de novo: 409");

  console.log("== a escada lê o nível do histórico ==");
  const esc = async () => (((await E.req("Consagração a Presbítero", P.nomeado, "INDICACAO")).body.requisitos || {}).itens || []).find((i) => i.chave === "escolaridade");
  ok((await esc()).situacao === "FALTA", "o Diácono com o Básico (à mão) não atende o Presbítero");
  ok((await matricular(P.nomeado, "AVANCADO")).status === 201, "matriculado no Avançado");
  let it = await esc();
  ok(it.situacao === "ATENDE" && /Avançado \(cursando\)/.test(it.detalhe || ""), "agora atende: 'Avançado (cursando)' vem do histórico", it);
  const lista = await afmDb.listarMatriculas(pool);
  const linha = lista.find((m) => m.membroId === P.nomeado);
  ok(linha && linha.nivelAtende === true && linha.nivelHistorico.includes("Avançado (cursando)") && linha.nivel === "BASICO", "a lista da Academia diz o mesmo (e mostra o registrado à mão)", linha);
  const cmAv = await escalar("SELECT CursoMatriculaId FROM AFMCursoMatriculas WHERE MembroId = @m AND CursoId = @c", { m: P.nomeado, c: curso.AVANCADO });
  ok((await post("cancelar-curso", { cursoMatriculaId: cmAv, motivo: "Desistiu do Avançado (e2e)" })).status === 200 && (await esc()).situacao === "FALTA", "cancelada a matrícula, volta a faltar");
  ok((await matricular(P.nomeado, "AVANCADO")).status === 201, "e pode voltar numa matrícula nova");

  console.log("== o requisito de formação que exige uma disciplina ==");
  const trilhas = req("shared/trilhas.js");
  const ALVO = "Consagração a Presbítero";
  r = await post("requisito", { contexto: "CONSAGRACAO", alvoChave: ALVO, disciplinaId: hom, modo: "BLOQUEIA" });
  ok(r.status === 201, "Homilética exigida na consagração a Presbítero", r.body);
  const reqId = r.body.requisitoId;
  ok((await post("requisito", { contexto: "HABILITACAO_TREINAMENTO", disciplinaId: hom })).status === 422, "o treinamento do voluntariado não aceita disciplina (o ministério com menores confere pelas trilhas)");
  r = await disc({ disciplinaId: hom, cursoId: curso.MEDIO, nome: "Homilética E2E", area: "TEOLOGIA", cargaHoraria: "12", preRequisitos: [lit], ativa: false });
  ok(r.status === 422 && /exigida num fluxo/.test(r.body.mensagem), "desativar a disciplina exigida: recusado", r.body);
  r = await disc({ disciplinaId: lit, cursoId: curso.BASICO, nome: "Liturgia E2E", area: "LITURGIA", cargaHoraria: "10", preRequisitos: [bib], ativa: false });
  ok(r.status === 422 && /pré-requisito/.test(r.body.mensagem), "desativar o pré-requisito de uma disciplina ativa: recusado", r.body);
  ok((await post("requisito", { contexto: "INVENTADO", disciplinaId: hom })).status === 422 && (await post("requisito", { contexto: "CONSAGRACAO", alvoChave: ALVO, disciplinaId: "1e3" })).status === 422, "contexto e disciplina inválidos: recusados");
  let av = await trilhas.avaliarRequisitos(pool, { contexto: "CONSAGRACAO", alvoChave: ALVO, membroId: P.nomeado });
  ok(av.bloqueado && /disciplina "Homilética E2E \(Médio\)" da AFM: ainda não cursada/.test(av.mensagemBloqueio), "a consagração trava pela disciplina", av);
  ok(!(await trilhas.avaliarRequisitos(pool, { contexto: "CONSAGRACAO", alvoChave: "Consagração a Pastor", membroId: P.nomeado })).bloqueado, "outro tipo de consagração não é afetado");
  await apr({ disciplinaId: hom, disciplinaOrigem: "Homilética I" });
  av = await trilhas.avaliarRequisitos(pool, { contexto: "CONSAGRACAO", alvoChave: ALVO, membroId: P.nomeado });
  ok(!av.bloqueado && av.temRequisitos, "aproveitada, atende", av);
  const filtro = await trilhas.filtrarMembrosQueAtendem(pool, { contexto: "CONSAGRACAO", alvoChave: ALVO, membroIds: [P.nomeado, P.vetado] });
  ok(filtro.atendem.has(P.nomeado) && filtro.bloqueados.has(P.vetado), "em lote também (a escala usa este)");
  ok((await post("remover-requisito", { requisitoId: reqId })).status === 200 && (await post("remover-requisito", { requisitoId: reqId })).status === 404, "removido; de novo: 404");

  console.log("== os documentos ==");
  const AUX = MEMBRO(P.auxiliar);
  r = await post("documento", { tipo: "HISTORICO" }, AUX);
  ok(r.status === 201 && r.body.certificadoId, "a própria pessoa emite o histórico escolar", r.body);
  const hist = r.body.certificadoId;
  ok((await post("documento", { tipo: "HISTORICO" }, AUX)).body.certificadoId === hist, "o mesmo no mesmo dia: o já emitido (sem duplicar)");
  const conteudo = await escalar("SELECT Conteudo FROM AFMDocumentosAcademicos WHERE CertificadoId = @c", { c: hist });
  ok(/Bibliologia E2E/.test(conteudo) && !/Auxiliar Promovido/.test(conteudo) && !/equivalentes/.test(conteudo), "a fotografia: as disciplinas, sem o nome e sem o parecer");
  ok((await post("documento", { tipo: "DECLARACAO", cursoMatriculaId: cmAux }, AUX)).status === 422, "a declaração do curso concluído: recusada (ele tem o diploma)");
  await matricular(P.auxiliar, "MEDIO");
  const cmMed = await escalar("SELECT CursoMatriculaId FROM AFMCursoMatriculas WHERE MembroId = @m AND CursoId = @c AND Situacao = 'CURSANDO'", { m: P.auxiliar, c: curso.MEDIO });
  r = await post("documento", { tipo: "DECLARACAO", cursoMatriculaId: cmMed }, AUX);
  ok(r.status === 201 && (await escalar("SELECT CONVERT(varchar(10), ValidoAte, 120) FROM CertificadosEmitidos WHERE CertificadoId = @c", { c: r.body.certificadoId })) === req("shared/seminario.js").somarDias(hoje, 30),
    "a declaração de matrícula vale 30 dias", r.body);
  const decl = r.body.certificadoId;
  await q("UPDATE Matriculas_AFM SET StatusMatricula = 'INATIVA' WHERE MembroId = @m", { m: P.auxiliar });
  r = await post("documento", { tipo: "DECLARACAO", cursoMatriculaId: cmMed }, AUX);
  ok(r.status === 422 && /matrícula ativa na AFM/.test(r.body.mensagem), "o desmatriculado da AFM não emite a declaração de 'regularmente matriculado'", r.body);
  await q("UPDATE Matriculas_AFM SET StatusMatricula = 'ATIVA' WHERE MembroId = @m", { m: P.auxiliar });
  ok((await post("documento", { tipo: "HISTORICO", membroId: P.auxiliar }, MEMBRO(P.vetado))).status === 404, "outra pessoa não emite o histórico de ninguém");
  ok((await post("documento", { tipo: "HISTORICO", membroId: P.auxiliar })).status === 201, "a Academia emite");
  ok((await post("documento", { tipo: "OUTRO" }, AUX)).status === 422, "documento desconhecido: recusado");
  for (const [id, nome] of [[hist, "historico-escolar"], [decl, "declaracao-matricula"], [diploma, "diploma-afm"]]) {
    const pdf = await chamarRota("CertificadoPdf/index.js", { binding: { id }, token: AUX });
    ok(pdf.status === 200 && Buffer.isBuffer(pdf.body) && pdf.body.slice(0, 4).toString() === "%PDF" && new RegExp(nome).test(pdf.headers["Content-Disposition"]), `o PDF: ${nome}`, pdf.status);
  }
  ok((await chamarRota("CertificadoPdf/index.js", { binding: { id: hist }, token: MEMBRO(P.vetado) })).status === 404, "o PDF de outra pessoa: 404");
  ok((await chamarRota("CertificadoPdf/index.js", { binding: { id: hist }, token: AFM() })).status === 200, "a Academia baixa");
  ok((await chamarRota("CertificadoPdf/index.js", { binding: { id: hist }, token: LIDER(P.lider, ["afm"], [CENTRAL]) })).status === 404, "a AFM local não baixa o histórico (notas e frequência são do nível geral)");
  const codHist = await escalar("SELECT CodigoVerificacao FROM CertificadosEmitidos WHERE CertificadoId = @c", { c: hist });
  ok(/selo [0-9A-F]{12}$/.test(await escalar("SELECT Titulo FROM CertificadosEmitidos WHERE CertificadoId = @c", { c: hist })), "o título do histórico leva o selo do conteúdo");
  r = await chamarRota("VerificarCertificado/index.js", { binding: { codigo: codHist } });
  ok(r.body.situacao === "VALIDO" && r.body.historico && r.body.historico.disciplinas.some((d) => d.disciplina === "Bibliologia E2E" && d.nota === 8.5), "a verificação pública mostra as disciplinas com a nota", r.body);
  await q("UPDATE AFMDocumentosAcademicos SET Conteudo = REPLACE(Conteudo, '\"nota\":8.5', '\"nota\":10') WHERE CertificadoId = @c", { c: hist });
  r = await chamarRota("VerificarCertificado/index.js", { binding: { codigo: codHist } });
  ok(r.body.situacao === "INTEGRIDADE_FALHOU" && !r.body.historico, "o conteúdo mexido no banco: a verificação acusa", r.body);
  await q("UPDATE AFMDocumentosAcademicos SET Conteudo = REPLACE(Conteudo, '\"nota\":10', '\"nota\":8.5') WHERE CertificadoId = @c", { c: hist });
  const codigo = await escalar("SELECT CodigoVerificacao FROM CertificadosEmitidos WHERE CertificadoId = @c", { c: diploma });
  r = await chamarRota("VerificarCertificado/index.js", { binding: { codigo } });
  ok(r.status === 200 && r.body.situacao === "VALIDO" && /Diploma — Nível Básico/.test(r.body.titulo), "a verificação pública do diploma", r.body);
  const cod1 = await escalar("SELECT CodigoVerificacao FROM CertificadosEmitidos WHERE CertificadoId = @c", { c: diploma1 });
  ok((await chamarRota("VerificarCertificado/index.js", { binding: { codigo: cod1 } })).body.situacao === "REVOGADO", "o diploma da conclusão anulada: revogado");
  ok((await chamarRota("GestaoCertificados/index.js", { metodo: "POST", binding: { acao: "revogar" }, token: GERAL(1002, ["ebd_gestao", "trilhas_gestao"]), corpo: { certificadoId: diploma, motivo: "teste e2e" } })).status !== 200,
    "a gestão das trilhas não revoga o diploma da AFM");

  console.log("== cancelamentos ==");
  const tHom = (await turma(hom, P.pastor2)).body.turmaId;
  await matricular(P.vetado, "MEDIO");
  ok((await post("inscrever", { turmaId: tHom, membroIds: [P.vetado] })).body.resultados[0].sucesso === false, "Homilética sem Liturgia: o pré-requisito de outro curso vale");
  r = await post("inscrever", { turmaId: tHom, membroIds: [P.auxiliar] });
  ok(r.body.resultados[0].sucesso, "o Auxiliar (Liturgia aprovada) entra em Homilética");
  r = await post("cancelar-curso", { cursoMatriculaId: cmMed, motivo: "Mudou de cidade (e2e)" });
  ok(r.status === 422 && /turma aberta/.test(r.body.mensagem), "cancelar o curso com turma aberta: cancele a inscrição antes", r.body);
  ok((await post("encerrar", { turmaId: tHom })).status === 422, "encerrar com nota faltando: recusado");
  ok((await post("cancelar-inscricao", { turmaId: tHom, membroId: P.auxiliar })).status === 400, "cancelar a inscrição sem motivo: 400");
  ok((await post("cancelar-inscricao", { turmaId: tHom, membroId: P.auxiliar, motivo: "Mudou de cidade (e2e)" })).status === 200, "inscrição cancelada");
  ok((await post("cancelar-curso", { cursoMatriculaId: cmMed, motivo: "Mudou de cidade (e2e)" })).status === 200, "agora o curso se cancela");
  ok((await post("cancelar-curso", { cursoMatriculaId: cmAux, motivo: "Mudou de cidade (e2e)" })).status === 422, "o curso concluído não se cancela");
  ok((await post("encerrar", { turmaId: tHom })).status === 422, "a turma sem inscrito não se encerra (exclua)");
  ok((await post("excluir-turma", { turmaId: tHom })).status === 422, "a turma só com a inscrição cancelada também não se exclui (a inscrição é histórico)");

  console.log("== o perfil, a minha, a ficha e Meus Dados ==");
  ok((await sem("pessoa", { query: { membroId: P.auxiliar }, token: LIDER(P.lider, ["pessoas"], [CENTRAL]) })).status === 200, "a liderança com 'pessoas' vê o histórico de quem está no território");
  ok((await sem("pessoa", { query: { membroId: P.foraEscopo }, token: LIDER(P.lider, ["pessoas"], [CENTRAL]) })).status === 404, "fora do território: 404");
  r = await sem("aluno", { query: { membroId: P.nomeado } });
  ok(r.status === 200 && r.body.matriculaAFMAtiva && r.body.aproveitamentos.some((a) => a.parecer), "a ficha do aluno na Academia (com o parecer)", r.body);
  ok(!(await sem("pessoa", { query: { membroId: P.nomeado } })).body.aproveitamentos.some((a) => a.parecer), "o perfil não leva o parecer");
  const perf = (await sem("pessoa", { query: { membroId: P.auxiliar } })).body;
  ok(perf.documentos.length === 0 && perf.cursos.every((c) => !c.diploma || (!c.diploma.codigo && !c.diploma.certificadoId)), "nem os códigos de verificação nem os documentos", perf.cursos.map((c) => c.diploma));
  h = (await sem("minha", { token: DOC })).body;
  ok(h.docencia.emExercicio && h.docencia.turmas.some((t) => t.turmaId === tBib), "o docente vê as turmas em que leciona");
  ok(!(await sem("minha", { token: MEMBRO(P.pastor3) })).body.docencia.emExercicio, "o que saiu do Corpo Docente não está em exercício");
  const md = await req("shared/seminarioDb.js").dadosDoTitular(pool, P.auxiliar);
  ok(md.cursos.length === 2 && md.turmas.length >= 2 && md.documentos.length >= 4 && md.aproveitamentos.some((a) => a.parecer), "Meus Dados: cursos, turmas, aproveitamentos (com o parecer) e documentos", md);

  console.log("== lixo ==");
  ok((await sem("turma", { query: { turmaId: "1e3" } })).status === 404 && (await sem("turma", { query: { turmaId: 99999 } })).status === 404, "turma malformada ou inexistente: 404");
  ok((await post("notas", { turmaId: tBib, itens: Array(501).fill({ membroId: P.auxiliar, nota: 8, horasPresentes: 18 }) })).status === 400, "mais de 500 notas: 400");
  ok((await post("inscrever", { turmaId: tBib, membroIds: "todos" })).status === 400, "a lista que não é lista: 400");
  ok((await post("concluir-curso", { cursoMatriculaId: 99999 })).status === 404 && (await post("anular-aproveitamento", { aproveitamentoId: 99999, motivo: "nada a anular aqui" })).status === 404, "ids inexistentes: 404");
  ok((await sem("aluno", { query: { membroId: "abc" } })).status === 404, "aluno malformado: 404");
  r = await chamarRota("GestaoSeminario/index.js", { metodo: "POST", binding: { acao: "disciplina" }, token: AFM(), corpo: [1, 2] });
  ok(r.status === 400, "corpo que não é objeto: 400");
  for (const lixo of [null, "", "<script>", { a: 1 }, -1, 1e20]) {
    const x = await post("turma", { disciplinaId: lixo, docenteMembroId: lixo, dataInicio: lixo, dataFim: lixo });
    ok(x.status === 400, `turma com lixo (${JSON.stringify(lixo)}): 400`);
  }

  if (process.env.E2E_CONTRATO) {
    // uma turma ABERTA do docente, com aluno inscrito (a tela do lançamento)
    const tAberta = (await turma(lit, P.pastor2)).body.turmaId;   // (o nomeado tem Bibliologia aprovada)
    await post("inscrever", { turmaId: tAberta, membroIds: [P.nomeado] });
    const contrato = { painel: (await sem("painel")).body, turma: (await sem("turma", { query: { turmaId: tBib } })).body, turmaAberta: (await sem("turma", { query: { turmaId: tAberta } })).body,
      aluno: (await sem("aluno", { query: { membroId: P.auxiliar } })).body,
      minha: (await sem("minha", { token: AUX })).body, minhaDocente: (await sem("minha", { token: DOC })).body, pessoa: (await sem("pessoa", { query: { membroId: P.auxiliar } })).body };
    require("fs").writeFileSync(path.join(__dirname, "..", "front-seminario", "contrato-real.json"), JSON.stringify(contrato, null, 2));
    console.log("contrato gravado em tools/front-seminario/contrato-real.json");
  }
  fim("e2e-66 seminário");
})().catch((e) => { console.log("ERRO", e); process.exit(1); });
