// e2e-68-trava8b.js — Trava de Revisão 8-B (fecha a FASE 8), com os handlers e o banco REAIS, sobre a base "cenario-escada" (a "preparar-escada" aplica a 164).
// As costuras e a lei que as duas revisões independentes acharam: o celebrante (Art. 78 §1º), a CLI por Ordenação com a credencial em dia (Estatuto Art. 15 §1º, I), o
// Seminário com as marcas da disciplina e o Reitor homologado, a saída da igreja e a minimização (Art. 132 §2º, II), o curso cancelado, a rematrícula com a reciclagem,
// o requisito de disciplina só na consagração, a Prova de Reintegração (Art. 77), o marco "só do nível geral", o CHM do Dirigente (Art. 67 §1º), a taxa no Anexo,
// o batismo de urgência (Art. 70 §5º), a trilha de discipulado (marcas, novo convertido, etapa desativada), Meus Dados e a turma reaberta.
const L = require("./lib");
const { ok, fim, q, escalar, obterPool, hojeBr, path, API, GERAL, LIDER } = L;
const E = require("./lib-escada");
const { P, CENTRAL, chamarRota, SEC } = E;

console.error = () => { };
const req = (m) => require(path.join(API, m));
const AFM = () => GERAL(1002, ["afm", "pessoas", "consagracoes"]);
const sem = (acao, corpo, token) => chamarRota("GestaoSeminario/index.js", { metodo: "POST", binding: { acao }, token: token || AFM(), corpo });

(async () => {
  const pool = await obterPool();
  const hoje = hojeBr();
  const ano = Number(hoje.slice(0, 4));
  const { central } = await E.montarCenario();
  const afmDb = req("shared/afmDb.js");
  const semDb = req("shared/seminarioDb.js");
  const licenca = async (m) => (await afmDb.licencasDe(pool, [m])).get(m);
  const qr = async (m) => req("shared/credencial.js").situacaoPublica({ situacao: "VALIDA", via: 1 }, await req("shared/credencialDb.js").pessoa(pool, m));
  const sancao = async (m, fimPena) => escalar(`INSERT INTO ProcessosDisciplinares (MembroId, DataAbertura, Status, Resultado, DataConclusao, DiasSancao, DataTerminoPrevisao)
    OUTPUT INSERTED.ProcessoId VALUES (@m, '2026-06-01', 'JULGADO', 'SANCAO', '2026-06-10', 30, @fim)`, { m, fim: fimPena });

  console.log("== migração 164 ==");
  ok((await escalar("SELECT COUNT(*) FROM sys.columns WHERE object_id = OBJECT_ID('CandidatosBatismo') AND name LIKE 'Urgencia%'")) === 5, "as colunas da urgência do batismo");
  ok(Number(await escalar("SELECT Valor FROM ValoresMonetarios WHERE Sigla = 'TAXA_CONSAGRACAO'")) === 70, "a taxa de consagração no Anexo de Parâmetros Monetários");
  ok(!/LIDERANCA/.test(await escalar("SELECT definition FROM sys.check_constraints WHERE name = 'CK_AFMDisciplinaRequisitos_Contexto'")), "o requisito de disciplina só na consagração");

  console.log("== Art. 78 §1º: só Pastores, Evangelistas e Presbíteros celebram ==");
  const lDiac = await licenca(P.nomeado);
  ok(lDiac.podeOficiar && !lDiac.celebraOficios, "o Diácono está com a credencial em dia, mas não celebra", lDiac);
  ok((await licenca(P.presbitero)).celebraOficios && (await licenca(P.pastor1)).celebraOficios, "o Presbítero e o Pastor celebram");
  const turma = (oficiantesMembroIds) => chamarRota("GestaoTurmasBatismo/index.js", { metodo: "POST", token: GERAL(1002, ["consagracoes", "pessoas"]),
    corpo: { dataBatismo: `${ano + 1}-05-16`, local: "Batistério E2E", tipoLocal: "BATISTERIO", congregacaoId: central, oficiantesMembroIds } });
  let r = await turma([P.nomeado]);
  ok(r.status === 422 && /Art\. 78 §1º/.test(r.body.mensagem), "o Diácono não oficia a turma de batismo", r.body);
  r = await turma([P.presbitero]);
  ok(r.status !== 422, "o Presbítero oficia", r.body);
  ok((await qr(P.presbitero)).celebraOficios === true && (await qr(P.auxiliar)).celebraOficios === false && (await qr(P.auxiliar)).funcao === "HABILITADO",
    "o QR: o Auxiliar habilitado não celebra; o Presbítero celebra");

  console.log("== a CLI por Ordenação só com a credencial em dia (Estatuto Art. 15 §1º, I) ==");
  const cli = await escalar("SELECT OrgaoId FROM Orgaos WHERE Sigla = 'CLI'");
  const naCLI = async (m) => (await req("shared/universo.js").composicaoCLI(pool, cli)).some((x) => Number(x.membroId) === m && x.viaOrdenacao);
  ok(await naCLI(P.pastor2), "antes: o Pastor está na CLI por Ordenação");
  const edc = (acao, corpo) => chamarRota("GestaoEducacaoContinuada/index.js", { metodo: "POST", binding: { acao }, token: AFM(), corpo });
  await edc("edicao", { data: `${ano - 1}-08-10`, cargaHoraria: 20, frequenciaMinimaPct: 75 });
  const edicaoId = await escalar("SELECT EdicaoId FROM AFMReciclagemEdicoes WHERE Ano = @a", { a: ano - 1 });
  await edc("resultados-reciclagem", { edicaoId, itens: [{ membroId: P.pastor1, resultado: "APROVADO", horasPresentes: 20 }, { membroId: P.presbitero, resultado: "APROVADO", horasPresentes: 20 },
    { membroId: P.pastor4, resultado: "APROVADO", horasPresentes: 20 }] });
  ok(!(await naCLI(P.pastor2)) && (await naCLI(P.pastor1)), "sem a reciclagem renovada (Art. 68 §3º): sai da CLI por Ordenação; o aprovado fica");
  const minha = await afmDb.minhaSituacao(pool, P.pastor2);
  ok(minha && !minha.cli.naCLI, "o Meu Painel diz o mesmo (fora da CLI)", minha && minha.cli);
  const quadro = await afmDb.painelFaltasCLI(pool, await req("shared/universo.js").composicaoCLI(pool, cli));
  const noQuadro = quadro.inativosAFM.find((x) => Number(x.membroId) === P.pastor2);
  ok(noQuadro && noQuadro.motivo === "CREDENCIAL" && /Art\. 68 §3º/.test(noQuadro.detalhe), "e o quadro da CLI mostra quem está fora e por quê", noQuadro);

  console.log("== o Seminário: o Corpo Docente em exercício e as marcas da disciplina ==");
  await afmDb.nomearReitor(pool, { membroId: P.pastor3, dataInicio: `${ano}-01-10`, titulacao: "Mestre em Teologia", por: 1002 });
  for (const m of [P.pastor4, P.presbitero]) await afmDb.cadastrarDocente(pool, { membroId: m, titulacao: "Bacharel em Teologia", dataInicio: "2025-01-01", por: 1002 });
  let docentes = (await semDb.docentesEmExercicio(pool)).map((d) => d.membroId);
  ok(!docentes.includes(P.pastor3) && (await semDb.reitorEm(pool, hoje)) === null, "o Reitor ainda não homologado pela CLI não está em exercício (nem assina)");
  await q("UPDATE AFMCorpoDocente SET HomologadoCLIEm = @h, HomologacaoAto = N'Ata da CLI (e2e)' WHERE MembroId = @m AND Papel = 'REITOR'", { h: `${ano}-01-15`, m: P.pastor3 });
  ok((await semDb.docentesEmExercicio(pool)).some((d) => d.membroId === P.pastor3 && d.reitor) && /Tres/.test(await semDb.reitorEm(pool, hoje)), "homologado: em exercício e assina");
  ok(docentes.includes(P.pastor4), "o docente em dia está em exercício");
  const susp4 = await sancao(P.pastor4, E.diasAtras(-30));
  ok(!(await semDb.docentesEmExercicio(pool)).some((d) => d.membroId === P.pastor4), "o docente afastado pela disciplina não está (não lança nota, não dá parecer, não abre turma)");
  await q("DELETE FROM ProcessosDisciplinares WHERE ProcessoId = @p", { p: susp4 });

  console.log("== o curso cancelado tira o 'cursando' registrado à mão ==");
  const basico = await escalar("SELECT CursoId FROM AFMCursos WHERE Nivel = 'BASICO'");
  const medio = await escalar("SELECT CursoId FROM AFMCursos WHERE Nivel = 'MEDIO'");
  ok((await sem("matricular-curso", { membroId: P.vetado, cursoId: medio, data: `${ano}-02-01` })).status === 201, "o Auxiliar (Médio cursando à mão) no curso Médio");
  const cmVet = await escalar("SELECT CursoMatriculaId FROM AFMCursoMatriculas WHERE MembroId = @m AND CursoId = @c", { m: P.vetado, c: medio });
  ok((await sem("cancelar-curso", { cursoMatriculaId: cmVet, motivo: "Largou o curso no meio (e2e)" })).status === 200, "cancelado");
  ok((await escalar("SELECT TOP 1 ISNULL(NivelEscolaridade, 'NULO') FROM Matriculas_AFM WHERE MembroId = @m ORDER BY MatriculaId DESC", { m: P.vetado })) === "NULO",
    "o 'Médio (cursando)' à mão caiu junto (a escada não atende mais por ele)", await q("SELECT MatriculaId, NivelEscolaridade, NivelConcluido, StatusMatricula FROM Matriculas_AFM WHERE MembroId = @m", { m: P.vetado }));
  // a exclusão: fora do rol na prática (a disciplina não muda o cadastro)
  await q(`INSERT INTO ProcessosDisciplinares (MembroId, DataAbertura, Status, Resultado, DataConclusao) VALUES (@m, '2026-09-01', 'JULGADO', 'EXCLUSAO', @d)`, { m: P.vetado, d: hoje });
  const mv = await semDb.matriculaAFMAtiva(pool, P.vetado);
  ok(mv && !mv.ativa && !mv.noRol, "o excluído não tem a matrícula ativa na AFM (não se inscreve, não recebe declaração nem diploma)", mv);

  console.log("== a turma reaberta não tira a disciplina de quem não teve a nota mexida ==");
  const disc = (await sem("disciplina", { cursoId: basico, nome: "Costura E2E", area: "TEOLOGIA", cargaHoraria: "10", obrigatoria: true })).body.disciplinaId;
  for (const m of [P.auxiliar, P.nomeado]) await sem("matricular-curso", { membroId: m, cursoId: basico, data: `${ano}-02-01` });
  const tId = (await sem("turma", { disciplinaId: disc, docenteMembroId: P.presbitero, dataInicio: `${ano}-02-01`, dataFim: `${ano}-06-30` })).body.turmaId;
  await sem("inscrever", { turmaId: tId, membroIds: [P.auxiliar, P.nomeado] });
  await sem("notas", { turmaId: tId, itens: [{ membroId: P.auxiliar, nota: 9, horasPresentes: 10 }, { membroId: P.nomeado, nota: 8, horasPresentes: 10 }] });
  await sem("encerrar", { turmaId: tId });
  ok((await sem("reabrir", { turmaId: tId, motivo: "Corrigir a nota de um aluno (e2e)" })).status === 200, "reaberta para corrigir um aluno");
  const est = await semDb.estados(pool, [P.auxiliar]);
  ok((est.get(P.auxiliar).get(disc) || {}).cumprida === true, "o outro aluno continua com a disciplina cumprida enquanto ela está reaberta");
  await sem("notas", { turmaId: tId, itens: [{ membroId: P.nomeado, nota: 3, horasPresentes: 10 }] });
  ok(!((await semDb.estados(pool, [P.nomeado])).get(P.nomeado).get(disc) || {}).cumprida, "o aluno que teve a nota mudada para reprovado perde na hora");
  await sem("notas", { turmaId: tId, itens: [{ membroId: P.nomeado, nota: 8, horasPresentes: 10 }] });
  await sem("encerrar", { turmaId: tId });

  console.log("== o requisito de disciplina só na consagração ==");
  r = await sem("requisito", { contexto: "LIDERANCA", alvoChave: "3", disciplinaId: disc });
  ok(r.status === 422 && /consagração/.test(r.body.mensagem), "na liderança (e na escala, na EBD, no batismo): recusado", r.body);
  ok((await sem("requisito", { contexto: "CONSAGRACAO", alvoChave: "Separação ao Diaconato", disciplinaId: disc })).status === 201, "na consagração, aceito");
  ok(Object.keys((await chamarRota("GestaoSeminario/index.js", { binding: { acao: "painel" }, token: AFM() })).body.contextos).join() === "CONSAGRACAO", "a tela só oferece a consagração");

  console.log("== a saída da igreja (vacância) e a minimização (Art. 132 §2º, II) ==");
  const sai = P.foraEscopo;
  await afmDb.cadastrarDocente(pool, { membroId: sai, titulacao: "Bacharel", dataInicio: "2025-01-01", por: 1002 });
  await sem("matricular-curso", { membroId: sai, cursoId: basico, data: `${ano}-02-01` });
  const tAberta = (await sem("turma", { disciplinaId: disc, docenteMembroId: P.presbitero, dataInicio: `${ano}-02-01`, dataFim: `${ano}-12-30` })).body.turmaId;
  ok((await sem("inscrever", { turmaId: tAberta, membroIds: [sai] })).body.resultados[0].sucesso, "a pessoa que vai sair está num curso e numa turma aberta");
  const hist = (await chamarRota("GestaoSeminario/index.js", { metodo: "POST", binding: { acao: "documento" }, token: AFM(), corpo: { tipo: "HISTORICO", membroId: sai } })).body.certificadoId;
  const codHist = await escalar("SELECT CodigoVerificacao FROM CertificadosEmitidos WHERE CertificadoId = @c", { c: hist });
  await req("shared/vacancia.js").encerrarVinculos(pool, require(path.join(API, "shared/db.js")).sql, sai, "Carta de Mudança");
  ok((await escalar("SELECT COUNT(*) FROM AFMCorpoDocente WHERE MembroId = @m AND DataFim IS NULL", { m: sai })) === 0, "a vacância encerra a linha do Corpo Docente");
  ok((await escalar("SELECT TOP 1 StatusMatricula FROM Matriculas_AFM WHERE MembroId = @m ORDER BY MatriculaId DESC", { m: sai })) === "INATIVA", "a matrícula da AFM fica inativa (quem voltar recomeça)");
  ok((await escalar("SELECT Situacao FROM AFMCursoMatriculas WHERE MembroId = @m", { m: sai })) === "CANCELADA" && (await escalar("SELECT Situacao FROM AFMTurmaAlunos WHERE MembroId = @m AND TurmaId = @t", { m: sai, t: tAberta })) === "CANCELADO",
    "o curso e a inscrição na turma aberta se cancelam");
  await req("shared/minimizacaoLgpd.js").minimizarCamposExMembro(pool, sai, { dataSaida: hoje, motivo: "Carta de Mudança" });
  ok((await escalar("SELECT COUNT(*) FROM AFMCursoMatriculas WHERE MembroId = @m", { m: sai })) === 0 && (await escalar("SELECT COUNT(*) FROM AFMTurmaAlunos WHERE MembroId = @m", { m: sai })) === 0
    && (await escalar("SELECT COUNT(*) FROM CertificadosEmitidos WHERE MembroId = @m AND Natureza IN ('HISTORICO', 'DIPLOMA_AFM', 'DECLARACAO')", { m: sai })) === 0, "a minimização elimina o histórico escolar e os documentos");
  ok((await chamarRota("VerificarCertificado/index.js", { binding: { codigo: codHist } })).status === 404, "a verificação pública do histórico passa a dizer 'não encontrado'");

  console.log("== a rematrícula confere a reciclagem (Art. 69 §3º) ==");
  r = await afmDb.rematricular(pool, { membroId: P.inativo, reciclagemAprovadaEm: hoje, observacao: null, por: 1002 });
  ok(!r.sucesso && /Reciclagem/.test(r.mensagem), "sem aprovação registrada e sem a observação: recusada", r);
  r = await afmDb.rematricular(pool, { membroId: P.inativo, reciclagemAprovadaEm: hoje, observacao: "Reciclagem feita na Convenção estadual (e2e)", por: 1002 });
  ok(r.sucesso, "com a observação de onde foi feita: aceita", r);

  console.log("== a Prova de Reintegração (Art. 77) ==");
  const s2 = await sancao(P.pastor2, E.diasAtras(5));
  const prova = (corpo, token) => chamarRota("EvoluirProcessoDisciplinar/index.js", { metodo: "POST", binding: { processoId: String(s2) }, token: token || SEC(), corpo: { acao: "REGISTRAR_PROVA_REINTEGRACAO", resultadoProva: "APROVADO", ...corpo } });
  ok((await prova({ dataProva: E.diasAtras(-3) })).status === 400, "a data no futuro: recusada");
  ok((await prova({ dataProva: E.diasAtras(10) })).status === 400, "a data antes do fim da suspensão: recusada");
  ok((await prova({ dataProva: "2026-02-30" })).status === 400, "a data inválida: recusada");
  const sMinha = await sancao(1002, E.diasAtras(5));
  r = await chamarRota("EvoluirProcessoDisciplinar/index.js", { metodo: "POST", binding: { processoId: String(sMinha) }, token: SEC(), corpo: { acao: "REGISTRAR_PROVA_REINTEGRACAO", resultadoProva: "APROVADO" } });
  ok(r.status === 422 && /próprio/.test(r.body.mensagem), "ninguém registra a prova do próprio processo", r.body);
  ok((await prova({ dataProva: E.diasAtras(1) })).body.sucesso, "a prova depois do fim da pena: registrada");

  console.log("== o marco 'só do nível geral' não se corrige em si mesmo ==");
  const marco = await escalar("INSERT INTO MarcosMembro (MembroId, Tipo, Descricao, DataMarco) OUTPUT INSERTED.MarcoId VALUES (1002, 'BATISMO_ESPIRITO_SANTO', N'Batismo no Espírito', '2010-01-01')");
  r = await chamarRota("EditarMarcoMembro/index.js", { metodo: "PUT", binding: { marcoId: String(marco) }, token: GERAL(1002, ["pessoas"]), corpo: { justificativa: "ajuste", dataMarco: "2009-01-01" } });
  ok(r.status === 422, "recusado (a mesma trava do registro)", r.body);

  console.log("== Art. 67 §1º: o Dirigente sem o CHM ==");
  const papelDir = await escalar("SELECT TOP 1 PapelId FROM Papeis WHERE Nome = N'Dirigente de Congregação'");
  const lid = (membroId) => chamarRota("GestaoLideranca/index.js", { metodo: "POST", token: GERAL(1002, ["permissoes"]), corpo: { membroId, papelId: papelDir, escopoTipo: "CONGREGACAO", escopoId: central, senha: "Senha#2026e2e" } });
  r = await lid(P.candidato);
  ok(r.body.sucesso && /CHM/.test(r.body.mensagem), "sem o CHM: registra, com o aviso (Art. 67 §1º)", r.body);
  r = await lid(P.missionario);
  ok(r.body.sucesso && !/CHM/.test(r.body.mensagem), "com o CHM: sem aviso", r.body);

  console.log("== a taxa de consagração vem do Anexo (Art. 65; Art. 75, I, a) ==");
  await q("UPDATE ValoresMonetarios SET Valor = 85.50 WHERE Sigla = 'TAXA_CONSAGRACAO'");
  const ce = (await E.cerimonias("criar", { dataCerimonia: `${ano + 1}-03-01`, local: "Templo E2E", ocasiao: "AGO" })).body.cerimoniaId;
  ok(Number(await escalar("SELECT ValorTaxa FROM CerimoniasConsagracao WHERE CerimoniaId = @c", { c: ce })) === 85.5, "a cerimônia nova sai com a taxa corrigida");

  console.log("== o batismo de urgência (Art. 70 §5º) ==");
  const cand = (await chamarRota("GestaoCandidatosBatismo/index.js", { metodo: "POST", token: GERAL(1002, ["consagracoes", "pessoas"]), corpo: { membroId: P.menor } })).body;
  const candId = cand.candidatoId || await escalar("SELECT CandidatoId FROM CandidatosBatismo WHERE MembroId = @m", { m: P.menor });
  const urg = (corpo, token) => chamarRota("GestaoCandidatosBatismo/index.js", { metodo: "PUT", binding: { id: String(candId) }, token: token || GERAL(1002, ["consagracoes", "pessoas"]), corpo: { acao: "URGENCIA", ...corpo } });
  ok((await urg({ motivo: "RISCO_DE_MORTE", detalhe: "Internado, pediu o batismo (e2e)", termoEm: hoje }, LIDER(P.lider, ["consagracoes", "pessoas"], [CENTRAL]))).status === 403, "a liderança local não autoriza (é ato da Presidência)");
  ok((await urg({ motivo: "QUALQUER", detalhe: "Internado, pediu o batismo (e2e)", termoEm: hoje })).status === 400, "motivo fora do catálogo: 400");
  ok((await urg({ motivo: "RISCO_DE_MORTE", detalhe: "Internado, pediu o batismo (e2e)", termoEm: E.diasAtras(-2) })).status === 400, "termo no futuro: 400");
  ok((await urg({ motivo: "RISCO_DE_MORTE", detalhe: "Internado, pediu o batismo (e2e)", termoEm: hoje })).body.sucesso, "registrado pelo nível geral");
  const linha = await L.um("SELECT CONVERT(varchar(10), UrgenciaTermoEm, 120) AS UrgenciaTermoEm, UrgenciaMotivo FROM CandidatosBatismo WHERE CandidatoId = @c", { c: candId });
  const apt = await req("shared/batismo.js").calcularAptidaoBatismo(pool, { membroId: P.menor, dataNascimento: "2000-01-01", estadoCivil: "SOLTEIRO", parecerVidaPregressa: "FAVORAVEL",
    discipuladoConcluidoManual: false, urgenciaTermoEm: linha.UrgenciaTermoEm });
  ok(apt.itens.discipulado.ok && /Pós-Batismal/.test(apt.itens.discipulado.detalhe), "o curso não trava a aptidão; o pós-batismal fica obrigatório", apt.itens.discipulado);
  ok(!/Internado/.test(await escalar("SELECT TOP 1 DadosDepois FROM AuditLog WHERE Tabela = 'CandidatosBatismo' ORDER BY AuditId DESC") || ""), "a auditoria guarda o motivo, não a situação descrita");

  console.log("== a trilha de discipulado ==");
  const disc8 = req("shared/discipuladoDb.js");
  await q("INSERT INTO MarcosMembro (MembroId, Tipo, Descricao, DataMarco) VALUES (@m, 'CONVERSAO', N'Conversão na cruzada (e2e)', @d)", { m: P.missionaria, d: E.diasAtras(20) });
  const naTrilha = async () => (await disc8.pessoasDasCongregacoes(pool, [central], await disc8.etapas(pool))).some((p) => p.membroId === P.missionaria);
  ok(await naTrilha(), "a convertida aparece na trilha");
  const exc = await escalar(`INSERT INTO ProcessosDisciplinares (MembroId, DataAbertura, Status, Resultado, DataConclusao) OUTPUT INSERTED.ProcessoId VALUES (@m, '2026-09-01', 'JULGADO', 'EXCLUSAO', @d)`, { m: P.missionaria, d: hoje });
  ok(!(await naTrilha()), "excluída: sai do funil e da fila do próximo passo");
  await q("DELETE FROM ProcessosDisciplinares WHERE ProcessoId = @p", { p: exc });
  const md = await disc8.dadosDoTitular(pool, P.missionaria);
  ok(md.marcos.some((x) => /cruzada/.test(x.descricao || "")), "Meus Dados traz os marcos do perfil (com a descrição)", md.marcos);
  // a etapa desativada fecha o item do próximo passo
  const cuidado = req("shared/cuidadoPastoralDb.js");
  const etapa = (await disc8.etapas(pool))[1];
  const destino = await cuidado.destinoDoItem(pool, { congregacaoId: central, membroId: P.missionaria, agora: new Date() });
  const g = await cuidado.gravarItem(pool, { tipo: "DISCIPULADO", congregacaoId: central, membroId: P.missionaria, motivo: "Próximo passo (e2e)", origem: "DISCIPULADO", deteccaoResumo: "e2e",
    prazoEm: new Date(Date.now() + 7 * 86400000), responsavelMembroId: null, nivel: destino.nivel, etapaDiscipuladoId: etapa.etapaId });
  await q("UPDATE EtapasDiscipulado SET Ativa = 0 WHERE EtapaId = @e", { e: etapa.etapaId });
  await disc8.rotinaDiaria(pool);
  const item = await L.um("SELECT Status, Desfecho FROM CuidadoItens WHERE ItemId = @i", { i: g.itemId });
  ok(item.Status === "CONCLUIDO" && item.Desfecho === "OUTRO", "a etapa desativada: o item fecha sozinho", item);
  await q("UPDATE EtapasDiscipulado SET Ativa = 1 WHERE EtapaId = @e", { e: etapa.etapaId });

  fim("e2e-68 trava 8-B");
})().catch((e) => { console.log("ERRO", e); process.exit(1); });
