// e2e-61-trava8a.js — Trava de Revisão 8-A (audita v8.1 a v8.4), com os handlers e o banco REAIS, sobre a base "cenario-escada" (a "preparar-escada" aplica a 160).
// O que a trava mudou: UMA regra de "quem está nas funções" (licença para oficiar, Comissão de Unção e o QR dizem o mesmo da mesma pessoa); a recusa do CEI gravada;
// ninguém mexe no que conta para a própria escada (AFM, batismo no Espírito Santo, nascimento/admissão/estado civil); a matrícula inativa não é beco sem saída; a saída
// fecha os processos de cargo e revoga o CHM; a minimização elimina os registros de consagração (Art. 132 §2º, II); a CLI não homologa no Seminário nem na reunião
// "não conta"; a homologação da CIADSETA (Art. 72, V, a); a indicação antiga vira nomeação; a lista da tesouraria; a credencial na diplomação (Art. 10); o processo
// antigo sem destino; o tempo de Presbítero e o CHM usado na elegibilidade do CEI; a readmissão depois da exclusão.
const L = require("./lib");
const { ok, fim, q, escalar, obterPool, hojeBr, path, API, sql, GERAL, LIDER } = L;
const E = require("./lib-escada");
const { P, TIPO, SEC, COMISSAO, CENTRAL, protocolar, evoluir, esteira, cerimonias, parecer, homologar, pagarTaxa, novaCerimonia, statusDe, chamarRota, afmPost, salvarPessoa, concluir } = E;

console.error = () => { };
const req = (m) => require(path.join(API, m));
const somar = (n) => req("shared/afm.js").somarDias(hojeBr(), n);

(async () => {
  const pool = await obterPool();
  const hoje = hojeBr();
  await E.montarCenario();
  const afmDb = req("shared/afmDb.js");
  const credDb = req("shared/credencialDb.js");
  const regraCred = req("shared/credencial.js");
  const vacancia = req("shared/vacancia.js");
  const id = (r) => r.body.consagracao.consagracaoId;
  const licenca = async (m) => (await afmDb.licencasDe(pool, [m])).get(m);
  const funcaoNoQR = async (m) => regraCred.situacaoPublica({ situacao: "VALIDA", via: 1 }, await credDb.pessoa(pool, m));

  console.log("== migração 160 ==");
  ok(await escalar("SELECT COL_LENGTH('dbo.ProcessosDisciplinares', 'CEIRecusouEm')") && await escalar("SELECT COL_LENGTH('dbo.Consagracoes', 'ConvencaoHomologadaEm')"),
    "colunas novas: a recusa do CEI e a homologação da CIADSETA");
  ok(/SAIDA_DO_ROL/.test(await escalar("SELECT definition FROM sys.check_constraints WHERE name = 'CK_Consagracoes_Encerramento'")), "o CHECK aceita os motivos da vacância");
  ok((await escalar("SELECT COUNT(*) FROM PoliticasRetencao WHERE Categoria LIKE N'Escada e consagração%' OR Categoria LIKE N'Credencial eclesiástica%'")) === 2, "a retenção da escada e da credencial");

  console.log("== uma regra só para 'quem está nas funções' ==");
  const sanc = async (m, extra = "") => escalar(`INSERT INTO ProcessosDisciplinares (MembroId, DataAbertura, Status, Resultado, DataConclusao${extra ? ", HomologadoPeloCEI" : ""})
    OUTPUT INSERTED.ProcessoId VALUES (@m, '2026-09-01', 'JULGADO', @res, '2026-09-20'${extra ? ", 0" : ""})`, { m, res: extra || "SANCAO" });
  ok((await licenca(P.pastor4)).podeOficiar && (await funcaoNoQR(P.pastor4)).funcao === "HABILITADO", "Pastor em dia: oficia e o QR diz habilitado");
  const s4 = await sanc(P.pastor4);
  const l4 = await licenca(P.pastor4);
  ok(!l4.podeOficiar && /Secretaria Geral/.test(l4.motivo) && !/san[cç][aã]o|suspens/i.test(l4.motivo), "suspenso: sem licença para oficiar, motivo genérico (a liderança local lê)", l4);
  const qr4 = await funcaoNoQR(P.pastor4);
  ok(qr4.situacao === "ATIVA" && qr4.funcao === "INATIVO", "o QR do suspenso: membro ativo, obreiro inativo", qr4);
  const ceA = await (async () => { const r = await cerimonias("criar", { dataCerimonia: somar(30), local: "Templo E2E", ocasiao: "AGO", valorTaxa: 70 }); return r.body.cerimoniaId; })();
  let r = await cerimonias("comissao", { cerimoniaId: ceA, membroIds: COMISSAO });
  ok(r.status === 422 && /Quatro E2E: não está em atividade/.test(r.body.mensagem), "a Comissão de Unção recusa o Pastor suspenso (a mesma regra)", r.body);
  await q("DELETE FROM ProcessosDisciplinares WHERE ProcessoId = @p", { p: s4 });
  ok((await cerimonias("comissao", { cerimoniaId: ceA, membroIds: COMISSAO })).status === 200, "sem a sanção, a comissão passa");
  // exclusão julgada pelo TER, pendente do CEI: continua membro, mas já não oficia
  const ex3 = await sanc(P.pastor3, "EXCLUSAO");
  const qr3 = await funcaoNoQR(P.pastor3);
  ok(!(await licenca(P.pastor3)).podeOficiar && qr3.situacao === "ATIVA" && qr3.funcao === "INATIVO", "exclusão pendente do CEI: ainda membro, já sem as funções (decisão da trava)", qr3);
  // o CEI recusa: a decisão perde o efeito e fica gravada
  r = await chamarRota("EvoluirProcessoDisciplinar/index.js", { metodo: "POST", binding: { processoId: String(ex3) }, token: SEC(), corpo: { acao: "HOMOLOGAR_EXCLUSAO", homologado: false } });
  ok(r.body && r.body.sucesso && (await escalar("SELECT CEIRecusouEm FROM ProcessosDisciplinares WHERE ProcessoId = @p", { p: ex3 })), "o CEI recusa: a recusa fica gravada", r.body);
  ok((await licenca(P.pastor3)).podeOficiar && (await funcaoNoQR(P.pastor3)).funcao === "HABILITADO", "e a decisão recusada não afasta mais ninguém");
  ok(!(await req("shared/disciplina.js").membrosSobDisciplina(pool)).has(P.pastor3), "nem conta como disciplina em curso (escada, CLI, assembleia)");
  r = await chamarRota("EvoluirProcessoDisciplinar/index.js", { metodo: "POST", binding: { processoId: String(ex3) }, token: SEC(), corpo: { acao: "HOMOLOGAR_EXCLUSAO", homologado: true } });
  ok(r.body && r.body.sucesso === false && /não está pendente/.test(r.body.mensagem), "recusada não se homologa depois (não está mais pendente)", r.body);
  // de licença: membro, mas fora das funções enquanto durar
  await q("UPDATE MembroReferencia SET Status = N'LICENÇA' WHERE MembroId = @m", { m: P.pastor2 });
  ok(!(await licenca(P.pastor2)).podeOficiar && (await funcaoNoQR(P.pastor2)).funcao === "INATIVO", "de licença: sem licença para oficiar, e o QR diz o mesmo");
  r = await cerimonias("comissao", { cerimoniaId: ceA, membroIds: COMISSAO });
  ok(r.status === 422 && /Dois E2E: não está em atividade/.test(r.body.mensagem), "e não unge", r.body);
  await q("UPDATE MembroReferencia SET Status = N'ATIVO' WHERE MembroId = @m", { m: P.pastor2 });
  // matrícula inativa: a comissão também recusa (antes contava como válida)
  await q("UPDATE Matriculas_AFM SET StatusMatricula = 'INATIVA' WHERE MembroId = @m", { m: P.lider });
  r = await cerimonias("comissao", { cerimoniaId: ceA, membroIds: [...COMISSAO, P.lider] });
  ok(r.status === 422 && /Dirigente Central E2E: não está em atividade/.test(r.body.mensagem), "Pastor com a AFM inativa não unge (Art. 69 §3º)", r.body);
  await q("UPDATE Matriculas_AFM SET StatusMatricula = 'ATIVA' WHERE MembroId = @m", { m: P.lider });

  console.log("== Art. 77: a suspensão terminada não devolve a função (decisão de 29/10/2026) ==");
  const susp = await escalar(`INSERT INTO ProcessosDisciplinares (MembroId, DataAbertura, Status, Resultado, DataConclusao, DiasSancao, DataTerminoPrevisao)
    OUTPUT INSERTED.ProcessoId VALUES (@m, '2026-06-01', 'JULGADO', 'SANCAO', '2026-06-10', 30, @fim)`, { m: P.pastor4, fim: somar(10) });
  ok(!(await licenca(P.pastor4)).podeOficiar, "suspenso, no prazo: fora das funções");
  const prova = (resultadoProva) => chamarRota("EvoluirProcessoDisciplinar/index.js", { metodo: "POST", binding: { processoId: String(susp) }, token: SEC(), corpo: { acao: "REGISTRAR_PROVA_REINTEGRACAO", resultadoProva } });
  r = await prova("APROVADO");
  ok(r.body.sucesso === false && /ainda não terminou/.test(r.body.mensagem), "a prova não vem antes do fim da suspensão", r.body);
  await q("UPDATE ProcessosDisciplinares SET DataTerminoPrevisao = @fim WHERE ProcessoId = @p", { p: susp, fim: somar(-3) });
  ok(!(await req("shared/disciplina.js").membrosSobDisciplina(pool)).has(P.pastor4), "o prazo acabou: a punição terminou (volta a ser membro em dia)");
  ok(!(await licenca(P.pastor4)).podeOficiar && (await funcaoNoQR(P.pastor4)).funcao === "INATIVO", "mas a função NÃO volta sozinha: carência administrativa (Art. 77 §1º)");
  r = await cerimonias("comissao", { cerimoniaId: ceA, membroIds: COMISSAO });
  ok(r.status === 422 && /Quatro E2E: não está em atividade/.test(r.body.mensagem), "nem unge na cerimônia", r.body);
  r = await chamarRota("ListarProcessosDisciplinares/index.js", { token: SEC() });
  const linhaSusp = ((r.body && (r.body.processos || r.body)) || []).find((x) => Number(x.processoId) === Number(susp));
  ok(linhaSusp && linhaSusp.emCarenciaAdministrativa === true, "a lista dos processos mostra a carência (e o botão da prova)", linhaSusp && { c: linhaSusp.emCarenciaAdministrativa });
  r = await prova("REPROVADO");
  ok(r.body.sucesso && !(await licenca(P.pastor4)).podeOficiar, "reprovado na prova: continua sem função até a próxima (§ 2º, II)");
  r = await prova("APROVADO");
  ok(r.body.sucesso && (await licenca(P.pastor4)).podeOficiar && (await funcaoNoQR(P.pastor4)).funcao === "HABILITADO", "aprovado: a função volta na hora (§ 2º, I)", r.body);

  console.log("== ninguém mexe no que conta para a própria escada ==");
  const eu = (m, perms) => GERAL(m, perms);
  for (const [acao, corpo] of [["nivel", { nivel: "BACHAREL", concluido: true }], ["rematricular", { reciclagemAprovadaEm: hoje }], ["anular-reprovacao", { motivo: "Lançada por engano (e2e)" }],
    ["reprovar", { data: hoje, detalhe: "Avaliação do Básico (e2e)" }]]) {
    r = await afmPost(acao, { membroId: P.presbitero, ...corpo }, eu(P.presbitero, ["afm"]));
    ok(r.status === 422 && /própria matrícula/.test(r.body.mensagem), `AFM "${acao}" na própria matrícula: 422`, r.body);
  }
  r = await afmPost("nivel", { membroId: P.auxiliar, nivel: "MEDIO", concluido: true }, eu(P.presbitero, ["afm"]));
  ok(r.status === 200 && r.body.sucesso, "na matrícula de outra pessoa, o mesmo ato passa", r.body);
  const marco = (m, token, tipo = "BATISMO_ESPIRITO_SANTO") => chamarRota("RegistrarMarcoMembro/index.js", { metodo: "POST", token, corpo: { membroId: m, tipo, descricao: "Batismo no Espírito Santo (e2e)", dataMarco: "2015-05-05" } });
  r = await marco(P.candidato, LIDER(P.lider, ["pessoas"], [CENTRAL]));
  ok(r.status === 403, "batismo no Espírito Santo: a liderança local não lança (conta para Diácono)", r.body);
  r = await marco(P.candidato, eu(P.candidato, ["pessoas"]));
  ok(r.status === 422 && /próprio batismo/.test(r.body.mensagem), "nem a própria pessoa, mesmo no nível geral", r.body);
  ok((await marco(P.candidato, SEC())).body.sucesso, "o nível geral lança o de outra pessoa");
  ok((await marco(P.candidato, LIDER(P.lider, ["pessoas"], [CENTRAL]), "CONVERSAO")).body.sucesso, "os outros marcos continuam com a liderança local");
  r = await salvarPessoa(P.auxiliar, { dataNascimento: "1991-01-01" }, eu(P.auxiliar, ["pessoas"]));
  ok(r.status === 422 && /própria data de nascimento/.test(r.body.mensagem), "a própria data de nascimento: 422", r.body);
  r = await salvarPessoa(P.auxiliar, { estadoCivil: "DIVORCIADO" }, eu(P.auxiliar, ["pessoas"]));
  ok(r.status === 422, "o próprio estado civil: 422", r.body);
  const pv = id(await protocolar({ membroId: P.vetado, assunto: TIPO.MISSIONARIO, proponenteMembroId: 1002 }));
  r = await salvarPessoa(P.vetado, { dataAdmissao: "2019-01-01" }, LIDER(P.lider, ["pessoas"], [CENTRAL]));
  ok(r.status === 403 && /processo de cargo em andamento/.test(r.body.mensagem), "com processo de cargo aberto, a liderança local não muda a admissão", r.body);
  r = await salvarPessoa(P.vetado, { estadoCivil: "CASADO", telefone: "91999990000" }, LIDER(P.lider, ["pessoas"], [CENTRAL]));
  ok(r.status === 200 && r.body.sucesso, "mas o resto do cadastro segue com ela (o estado civil igual não conta como mudança)", r.body);

  console.log("== a matrícula inativa não é beco sem saída ==");
  r = await afmPost("matricular-candidato", { membroId: P.candidato, nivel: "BASICO", data: hoje });
  ok(r.status === 201, "candidato matriculado", r.body);
  r = await afmPost("reprovar", { membroId: P.candidato, data: hoje, detalhe: "Reprovado no Básico (e2e)" });
  ok(r.body.sucesso && (await escalar("SELECT TOP 1 StatusMatricula FROM Matriculas_AFM WHERE MembroId = @m ORDER BY MatriculaId DESC", { m: P.candidato })) === "INATIVA", "reprovado: matrícula inativa", r.body);
  r = await afmPost("matricular-candidato", { membroId: P.candidato, nivel: "BASICO", data: hoje });
  ok(r.status === 201 && (await escalar("SELECT COUNT(*) FROM Matriculas_AFM WHERE MembroId = @m", { m: P.candidato })) === 2, "recomeça como candidato, numa matrícula nova", r.body);
  r = await afmPost("matricular-candidato", { membroId: P.candidato, nivel: "BASICO", data: hoje });
  ok(r.status === 422 && /matrícula ativa/.test(r.body.mensagem), "com a matrícula ativa, não ganha outra", r.body);

  console.log("== a saída fecha os processos de cargo e revoga o CHM ==");
  ok((await afmPost("chm", { membroId: P.missionaria, conceder: true, data: hoje })).body.sucesso, "CHM concedido (documento com QR)");
  const certMis = await escalar("SELECT CHMCertificadoId FROM Matriculas_AFM WHERE MembroId = @m", { m: P.missionaria });
  await vacancia.encerrarVinculos(pool, sql, P.vetado, "DESLIGAMENTO");
  ok((await statusDe(pv)) === "REPROVADO" && (await escalar("SELECT MotivoEncerramento FROM Consagracoes WHERE ConsagracaoId = @id", { id: pv })) === "SAIDA_DO_ROL",
    "desligado: o processo de cargo em andamento fecha (saída do rol)");
  ok((await escalar("SELECT CertificadoHabilitacao FROM Matriculas_AFM WHERE MembroId = @m", { m: P.vetado })) === false, "e o CHM sai da matrícula");
  await vacancia.encerrarVinculos(pool, sql, P.missionaria, "DISCIPLINA");
  ok((await escalar("SELECT RevogadoEm FROM CertificadosEmitidos WHERE CertificadoId = @c", { c: certMis })) && (await escalar("SELECT CertificadoHabilitacao FROM Matriculas_AFM WHERE MembroId = @m", { m: P.missionaria })) === false,
    "disciplina homologada: o documento do CHM é revogado (a verificação pública diz revogado)");
  // o processo que a disciplina encerrou: a liderança local lê só "vacância"
  await q(`INSERT INTO Consagracoes (MembroId, Assunto, ProponenteMembroId, Status, CargoAlvo, Modalidade, MotivoEncerramento, DataConclusao)
           VALUES (@m, @a, 1002, 'REPROVADO', 'DIACONO', 'INDICACAO', 'DISCIPLINA', @d)`, { m: P.missionaria, a: TIPO.DIACONO, d: hoje });
  const daLista = async (token) => ((await chamarRota("ListarConsagracoes/index.js", { token })).body || []).filter((c) => Number(c.membroId) === P.missionaria).map((c) => c.motivoEncerramento);
  ok((await daLista(LIDER(P.lider, ["consagracoes"], [CENTRAL]))).includes("VACANCIA") && !(await daLista(LIDER(P.lider, ["consagracoes"], [CENTRAL]))).includes("DISCIPLINA"), "a liderança local lê 'vacância' (revisão)");
  ok((await daLista(SEC())).includes("DISCIPLINA"), "o nível geral lê o motivo");
  ok((await afmPost("chm", { membroId: P.semSexo, conceder: true, data: hoje })).body.sucesso, "CHM de outro obreiro");
  await vacancia.encerrarVinculos(pool, sql, P.semSexo, "LICENCA_CANDIDATURA");
  ok((await escalar("SELECT CertificadoHabilitacao FROM Matriculas_AFM WHERE MembroId = @m", { m: P.semSexo })) === true, "a licença de candidatura é temporária: o CHM fica");
  // decisão de 29/10/2026 (Art. 157 §2º): a licença afasta das funções e da liderança; o título, o histórico e os processos ficam
  const pLic = await escalar(`INSERT INTO Consagracoes (MembroId, Assunto, ProponenteMembroId, Status, CargoAlvo, Modalidade) OUTPUT INSERTED.ConsagracaoId
    VALUES (@m, @a, 1002, 'PROTOCOLADO', 'DIACONO', 'INDICACAO')`, { m: P.disciplinado, a: TIPO.DIACONO });
  await q("UPDATE MembroReferencia SET Status = 'LICENCA_CANDIDATURA' WHERE MembroId = @m", { m: P.disciplinado });
  await vacancia.encerrarVinculos(pool, sql, P.disciplinado, "LICENCA_CANDIDATURA");
  ok((await statusDe(pLic)) === "PROTOCOLADO", "a licença de candidatura não fecha o processo de consagração");
  ok((await escalar("SELECT CargoMinisterial FROM MembroReferencia WHERE MembroId = @m", { m: P.disciplinado })) === "MISSIONARIO"
    && (await escalar("SELECT COUNT(*) FROM CargosMinisteriaisHistorico WHERE MembroId = @m AND Ate IS NULL", { m: P.disciplinado })) === 1, "nem tira o título (o histórico continua aberto)");
  ok(!(await licenca(P.disciplinado)).podeOficiar, "mas, enquanto dura, não oficia (Art. 157 §2º, II, a)");
  const comLicenca = await E.req(TIPO.DIACONO, P.disciplinado);
  ok((((comLicenca.body.requisitos || {}).itens || []).find((i) => i.chave === "comunhao") || {}).situacao === "ATENDE", "e a escada não trava pela licença", comLicenca.body);
  await q("UPDATE MembroReferencia SET Status = 'ATIVO' WHERE MembroId = @m", { m: P.disciplinado });

  console.log("== a CLI não homologa no Seminário nem na reunião 'não conta' ==");
  const sessao = (tipo, naoConta) => escalar(`INSERT INTO Sessoes (OrgaoId, Descricao, DataSessao, TipoSessao, Status${naoConta ? ", NaoContaMotivo, NaoContaEm" : ""}) OUTPUT INSERTED.SessaoId
    SELECT OrgaoId, N'E2E trava', @d, @t, 'ENCERRADA'${naoConta ? ", N'Aberta por engano', SYSUTCDATETIME()" : ""} FROM Orgaos WHERE Sigla = 'CLI'`, { d: hoje, t: tipo });
  const sem = await sessao("SEMINARIO_AFM");
  const nc = await sessao("ORDINARIA", true);
  r = await esteira("reunioes-cli", undefined, undefined, "GET");
  const lista = (r.body.itens || []).map((x) => x.sessaoId);
  ok(!lista.includes(sem) && !lista.includes(nc), "nem o Seminário nem a reunião 'não conta' aparecem para a homologação");
  const pe = id(await protocolar({ membroId: P.presbitero, assunto: TIPO.EVANGELISTA, proponenteMembroId: 1001, modalidade: "NOMEACAO_PRESIDENCIAL", atoReferencia: "Ato e2e-61" }));
  // o CHM com o documento (o cenário só tem a marca): a cerimônia o "usa" e o CEI o lê depois
  ok((await afmPost("chm", { membroId: P.presbitero, conceder: true, data: hoje })).body.sucesso, "o Presbítero tem o CHM como documento");
  await evoluir(pe, "AVANCAR"); await parecer(pe);
  for (const s of [sem, nc]) {
    r = await esteira("homologar", { ids: [pe], sessaoId: s });
    ok(r.body.sucesso === false && /reunião da CLI já realizada/.test(r.body.mensagem), "e mandar o id direto também não homologa", r.body);
  }

  console.log("== CIADSETA (Art. 72, V, a) ==");
  await homologar(pe, undefined, { ciadseta: false }); await pagarTaxa(pe);
  const ceB = await novaCerimonia();
  r = await cerimonias("incluir", { cerimoniaId: ceB, ids: [pe] });
  ok(r.body.sucesso === false && /CIADSETA/.test(r.body.mensagem), "Evangelista sem a homologação da CIADSETA não entra na cerimônia", r.body);
  r = await esteira("convencao", { consagracaoId: pe, data: somar(-1), ato: "Resolução 1/2026" });
  ok(r.status === 422 && /anterior à da CLI/.test(r.body.mensagem), "a CIADSETA não homologa antes da CLI", r.body);
  r = await esteira("convencao", { consagracaoId: pe, data: hoje, ato: "Resolução 1/2026" }, GERAL(P.presbitero, ["consagracoes"]));
  ok(r.status === 422 && /próprio processo/.test(r.body.mensagem), "ninguém registra a do próprio processo", r.body);
  r = await esteira("convencao", { consagracaoId: pe, data: hoje, ato: "Resolução 1/2026" }, LIDER(P.lider, ["consagracoes"], [CENTRAL]));
  ok(r.status === 403, "a liderança local não registra", r.body);
  r = await esteira("convencao", { consagracaoId: pe, data: hoje, ato: "x" });
  ok(r.status === 422, "sem o ato: 422", r.body);
  r = await esteira("convencao", { consagracaoId: pe, data: hoje, ato: "Resolução 1/2026 da AGO da CIADSETA" });
  ok(r.status === 200 && r.body.sucesso, "registrada", r.body);
  r = await cerimonias("incluir", { cerimoniaId: ceB, ids: [pe] });
  ok(r.body.sucesso, "agora entra na cerimônia", r.body);
  r = await esteira("convencao", { consagracaoId: pe, data: hoje, ato: "Outra resolução" });
  ok(r.status === 422 && /já está numa cerimônia/.test(r.body.mensagem), "na cerimônia, não se corrige mais", r.body);
  const pf = id(await protocolar({ membroId: P.forasteiro, assunto: TIPO.PASTOR, proponenteMembroId: 1001, modalidade: "OUTRA_CONVENCAO", atoReferencia: "Convenção de origem e2e" }));
  await evoluir(pf, "AVANCAR"); await parecer(pf); await homologar(pf, undefined, { ciadseta: false }); await pagarTaxa(pf);
  const ceF = await novaCerimonia();
  r = await cerimonias("incluir", { cerimoniaId: ceF, ids: [pf] });
  ok(r.body.sucesso === false && /CIADSETA/.test(r.body.mensagem), "quem vem de outra convenção também precisa da CIADSETA (decisão de 29/10/2026)", r.body);
  r = await esteira("convencao", { consagracaoId: pf, data: hoje, ato: "Resolução 2/2026 da CIADSETA" });
  ok(r.status === 200 && (await cerimonias("incluir", { cerimoniaId: ceF, ids: [pf] })).body.sucesso, "com ela registrada, entra na cerimônia", r.body);

  // o processo que entrou na cerimônia antes da trava (sem a CIADSETA): a edição da data recusa e o registro devolve à fila
  await q("UPDATE Consagracoes SET ConvencaoHomologadaEm = NULL, ConvencaoAto = NULL WHERE ConsagracaoId = @id", { id: pe });
  r = await cerimonias("editar", { cerimoniaId: ceB, dataCerimonia: hoje, local: "Templo Sede E2E", ocasiao: "AGO", valorTaxa: 70 });
  ok(r.status === 422 && /CIADSETA/.test(r.body.mensagem), "a cerimônia com candidato sem a CIADSETA não muda de data (revisão)", r.body);
  r = await cerimonias("registrar", { cerimoniaId: ceB, presentes: [pe], ausentes: [] });
  ok(r.body.sucesso && r.body.resultados[0].resultado === "VOLTOU" && /CIADSETA/.test(r.body.resultados[0].motivo) && (await statusDe(pe)) === "HOMOLOGADO", "e o registro o devolve à fila, sem consagrar", r.body);
  ok((await esteira("convencao", { consagracaoId: pe, data: hoje, ato: "Resolução 1/2026 da AGO da CIADSETA" })).body.sucesso, "a CIADSETA registrada de novo");
  const ceB2 = await novaCerimonia();
  ok((await cerimonias("incluir", { cerimoniaId: ceB2, ids: [pe] })).body.sucesso, "e ele entra noutra cerimônia");

  console.log("== a credencial na diplomação (Art. 10) ==");
  ok(!(await escalar("SELECT COUNT(*) FROM CredenciaisEclesiasticas WHERE MembroId = @m", { m: P.presbitero })), "antes da cerimônia, o Presbítero não tem credencial");
  r = await cerimonias("registrar", { cerimoniaId: ceB2, presentes: [pe], ausentes: [] });
  const xr = (r.body.resultados || [])[0] || {};
  ok(xr.resultado === "CONSAGRADO" && /Credencial emitida/.test(xr.motivo), "consagrado: a credencial é emitida junto", xr);
  // quem tem o cartão IMPRESSO: nova via, já pedida para impressão
  ok((await credDb.emitir(pool, { membroId: P.missionario, por: 1002 })).sucesso, "o Missionário tem credencial");
  const c1 = await escalar("SELECT CredencialId FROM CredenciaisEclesiasticas WHERE MembroId = @m AND Situacao = 'VALIDA'", { m: P.missionario });
  ok((await credDb.registrarImpressao(pool, { credencialId: c1, por: 1002 })).sucesso, "e o cartão foi impresso");
  const pd = id(await protocolar({ membroId: P.missionario, assunto: TIPO.DIACONO, proponenteMembroId: 1002 }));
  r = await concluir(pd);
  ok(r.body.sucesso && /Nova via da credencial/.test(r.body.mensagem), "consagrado a Diácono: nova via (o cartão impresso tinha o cargo antigo)", r.body);
  const vias = await q("SELECT Via, Situacao, ImpressaoSolicitadaEm FROM CredenciaisEclesiasticas WHERE MembroId = @m ORDER BY Via", { m: P.missionario });
  ok(vias.length === 2 && vias[0].Situacao === "SUBSTITUIDA" && vias[1].Situacao === "VALIDA" && vias[1].ImpressaoSolicitadaEm, "a via impressa é substituída e a nova entra na fila de impressão", vias);

  console.log("== a indicação antiga vira nomeação; o processo antigo sem destino ==");
  const antigo = await escalar(`INSERT INTO Consagracoes (MembroId, Assunto, ProponenteMembroId, Status, CargoAlvo, Modalidade) OUTPUT INSERTED.ConsagracaoId
    VALUES (@m, @a, 1002, 'EM_ANALISE_CONSELHO', 'EVANGELISTA', 'INDICACAO')`, { m: P.legado, a: TIPO.EVANGELISTA });
  r = await esteira("converter-nomeacao", { consagracaoId: antigo, ato: "x" });
  ok(r.status === 422, "sem o ato: 422", r.body);
  r = await esteira("converter-nomeacao", { consagracaoId: antigo, ato: "Ato da Presidência 9/2026" }, GERAL(P.legado, ["consagracoes"]));
  ok(r.status === 422 && /próprio processo/.test(r.body.mensagem), "ninguém converte o próprio", r.body);
  r = await esteira("converter-nomeacao", { consagracaoId: antigo, ato: "Ato da Presidência 9/2026" });
  ok(r.status === 200 && (await escalar("SELECT Modalidade FROM Consagracoes WHERE ConsagracaoId = @id", { id: antigo })) === "NOMEACAO_PRESIDENCIAL", "virou nomeação do Presidente, de onde estava", r.body);
  r = await esteira("converter-nomeacao", { consagracaoId: antigo, ato: "Ato da Presidência 9/2026" });
  ok(r.status === 422 && /já não é uma indicação/.test(r.body.mensagem), "converter de novo: 422", r.body);
  await q(`INSERT INTO Consagracoes (MembroId, Assunto, ProponenteMembroId, Status) VALUES (@m, @a, 1002, 'EM_ANALISE_CONSELHO')`, { m: P.nomeado, a: TIPO.PRESBITERO });
  r = await protocolar({ membroId: P.nomeado, assunto: TIPO.PRESBITERO, proponenteMembroId: 1001, modalidade: "NOMEACAO_PRESIDENCIAL", atoReferencia: "Ato e2e-61b" });
  ok(r.status === 409, "o processo de antes da v8.2 (sem destino gravado) também segura um segundo processo", r.body);

  console.log("== a lista da tesouraria ==");
  const pt = id(await protocolar({ membroId: P.auxiliar, assunto: TIPO.MISSIONARIO, proponenteMembroId: 1002 }));
  await evoluir(pt, "AVANCAR"); await parecer(pt);
  const TES = GERAL(1001, ["financeiro"]);
  r = await esteira("taxas", undefined, TES, "GET");
  const linha = (r.body.itens || []).find((x) => String(x.consagracaoId).toLowerCase() === String(pt).toLowerCase());
  ok(r.status === 200 && linha && linha.taxaPagaEm === null && linha.cargoAlvo === "MISSIONARIO" && !("parecer" in linha) && !("estadoCivil" in linha), "a tesouraria vê os aprovados, só com o que precisa", linha);
  ok((await esteira("taxas", undefined, LIDER(P.lider, ["financeiro"], [CENTRAL]), "GET")).status === 403, "o financeiro local não vê");
  r = await pagarTaxa(pt, {}, TES);
  ok(r.body.sucesso && (await esteira("taxas", undefined, TES, "GET")).body.itens.find((x) => String(x.consagracaoId).toLowerCase() === String(pt).toLowerCase()).taxaPagaEm, "e registra a taxa", r.body);

  console.log("== a minimização elimina os registros de consagração (Art. 132 §2º, II) ==");
  await homologar(pt);
  r = await concluir(pt);
  ok(r.body.sucesso, "o Auxiliar foi consagrado (diploma)", r.body);
  const codDip = await escalar("SELECT TOP 1 CodigoVerificacao FROM CertificadosEmitidos WHERE MembroId = @m AND Natureza = 'DIPLOMA'", { m: P.auxiliar });
  ok((await chamarRota("VerificarCertificado/index.js", { binding: { codigo: codDip } })).status === 200, "o diploma é verificável");
  await req("shared/minimizacaoLgpd.js").minimizarCamposExMembro(pool, P.auxiliar, { dataSaida: hoje, motivo: "Carta de Mudança" });
  ok((await escalar("SELECT COUNT(*) FROM CertificadosEmitidos WHERE MembroId = @m AND Natureza IN ('DIPLOMA', 'CHM')", { m: P.auxiliar })) === 0
    && (await escalar("SELECT COUNT(*) FROM Consagracoes WHERE MembroId = @m", { m: P.auxiliar })) === 0, "minimizado: o diploma, o CHM e os processos saem");
  ok((await chamarRota("VerificarCertificado/index.js", { binding: { codigo: codDip } })).status === 404, "e a verificação pública diz 'não encontrado'");

  console.log("== o CEI: o tempo de Presbítero e o CHM usado ==");
  const cei = await req("shared/cei.js").dadosElegibilidadeCEI(pool, sql, P.lider);
  ok(cei.anosDesdeConsagracaoPresbitero > 20, "o tempo de Presbítero (ou acima) vem do histórico de cargos", cei);
  ok(cei.afmAvancadoComCertificado === true, "Bacharel com o CHM: conta", cei);
  // o CHM usado na consagração do Presbítero (e2e: o Evangelista de agora) conta; depois da vacância por disciplina, não conta mais (revisão)
  ok((await req("shared/cei.js").dadosElegibilidadeCEI(pool, sql, P.presbitero)).afmAvancadoComCertificado === true, "o CHM usado na consagração ainda conta para o CEI");
  await vacancia.encerrarVinculos(pool, sql, P.presbitero, "DISCIPLINA");
  ok((await req("shared/cei.js").dadosElegibilidadeCEI(pool, sql, P.presbitero)).afmAvancadoComCertificado === false, "depois da decisão disciplinar, o CHM usado perde o efeito também para o CEI");
  ok((await req("shared/cei.js").dadosElegibilidadeCEI(pool, sql, P.pastor3)).disciplinaRigorosaUltimos10Anos === false, "a exclusão que o CEI recusou não pesa na elegibilidade");

  console.log("== a readmissão depois da exclusão ==");
  await q("INSERT INTO ProcessosDisciplinares (MembroId, DataAbertura, Status, Resultado, DataConclusao) VALUES (@m, '2025-01-01', 'JULGADO', 'EXCLUSAO', '2025-03-01')", { m: P.menor });
  ok((await credDb.pessoa(pool, P.menor)).excluido, "excluído");
  await q("UPDATE MembroReferencia SET DataAdmissao = '2026-01-01' WHERE MembroId = @m", { m: P.menor });
  ok(!(await credDb.pessoa(pool, P.menor)).excluido, "readmitido depois (admissão nova): já não conta como excluído");
  ok(!(await req("shared/disciplina.js").membrosSobDisciplina(pool)).has(P.menor), "e não está mais 'sob disciplina' na CLI e na assembleia (a mesma leitura)");
  r = await E.req(TIPO.AUXILIAR, P.menor);
  ok((((r.body.requisitos || {}).itens || []).find((i) => i.chave === "disciplina") || {}).situacao === "ATENDE", "nem na escada", r.body);
  await q("UPDATE MembroReferencia SET DataAdmissao = '2020-01-01' WHERE MembroId = @m", { m: P.menor });
  r = await salvarPessoa(P.menor, { dataAdmissao: "2026-02-01" }, LIDER(P.lider, ["pessoas"], [CENTRAL]));
  ok(r.status === 403 && /readmissão/.test(r.body.mensagem) && (await credDb.pessoa(pool, P.menor)).excluido, "a liderança local não 'readmite' mudando a data de admissão (revisão)", r.body);
  r = await salvarPessoa(P.menor, { dataAdmissao: "2026-02-01" });
  ok(r.status === 200 && !(await credDb.pessoa(pool, P.menor)).excluido, "a Secretaria (nível geral) registra a readmissão", r.body);

  console.log("== Meus Dados ==");
  const md = await req("shared/consagracaoDb.js").comissoesDoTitular(pool, P.pastor1);
  ok(md.length >= 1 && md[0].data, "as cerimônias em que esteve na Comissão de Unção", md);
  const tit = await req("shared/consagracaoDb.js").dadosDoTitular(pool, P.presbitero);
  const ev = tit.find((x) => x.cargo === "Evangelista");
  ok(ev && ev.ciadseta && ev.ciadseta.ato && /Nomeação/.test(ev.modalidade) && ev.ato === "Ato e2e-61", "o processo com a modalidade, o ato e a CIADSETA", ev);
  const mats = (await afmDb.dadosDoTitular(pool, P.semSexo)).matriculasAFM;
  ok(mats[0] && mats[0].chm === true && mats[0].chmEm && mats[0].chmCertificadoId, "a matrícula com o CHM e o documento", mats);

  fim("e2e-61 trava 8-A");
})().catch((e) => { console.log("ERRO", e); process.exit(1); });
