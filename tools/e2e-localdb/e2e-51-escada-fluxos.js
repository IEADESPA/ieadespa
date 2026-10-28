// e2e-51-escada-fluxos.js — v8.2 (Escada ministerial), com os handlers e o banco REAIS, sobre a base "cenario-escada" (cenario-afm + a migração 157 aplicada duas vezes:
// `bash rodar.sh preparar-escada`).
// O esquema da 157; a conferência dos requisitos (prévia, protocolo e a cada avanço); a conclusão que troca cargo, Função e histórico juntos; o interstício pelo histórico;
// a queima de etapas; o teto das obreiras; as modalidades (nomeação do Presidente com o nivelamento; outra convenção); Evangelista e Pastor só por indicação do Presidente;
// a disciplina (motivo só ao nível geral); a data de entrada no cargo informada pela Secretaria; a matrícula de candidato; o CHM (concedido, revogado no meio do processo);
// o veto técnico; o cadastro (cargo e dízimo só no nível geral; sexo); a vacância que fecha o histórico; Meus Dados; a auditoria.
const L = require("./lib");
const { ok, fim, q, um, escalar, obterPool, path, API, hojeBr, PIN } = L;
const E = require("./lib-escada");
const { P, TIPO, SEC, LIDER, req, protocolar, evoluir, concluir, afmGet, afmPost, pessoa, salvarPessoa, historico, item, chamarRota } = E;

let falhasAuditoria = 0;
const erroOriginal = console.error;
console.error = (...a) => { if (String(a[0]).includes("[AUDITORIA]")) falhasAuditoria++; if (process.env.E2E_VERBOSO) erroOriginal(...a); };
const contrato = {};
const guardar = (nome, r) => { contrato[nome] = r && r.body; return r; };
const cargo = (m) => escalar("SELECT CargoMinisterial FROM MembroReferencia WHERE MembroId = @m", { m });
const aberta = (m) => um("SELECT Cargo, CONVERT(varchar(10), Desde, 120) AS Desde, Origem, ConsagracaoId FROM CargosMinisteriaisHistorico WHERE MembroId = @m AND Ate IS NULL", { m });

(async () => {
  await obterPool();
  const hoje = hojeBr();

  console.log("== migração 157: esquema ==");
  ok((await escalar("SELECT COUNT(*) FROM sys.tables WHERE name = 'CargosMinisteriaisHistorico'")) === 1, "tabela CargosMinisteriaisHistorico existe");
  for (const [t, c] of [["MembroReferencia", "Sexo"], ["Consagracoes", "CargoAlvo"], ["Consagracoes", "Modalidade"], ["Consagracoes", "AtoReferencia"], ["Consagracoes", "RequisitosRetrato"],
    ["Consagracoes", "VetoAFMEm"], ["Consagracoes", "VetoAFMPor"], ["Consagracoes", "VetoAFMMotivo"], ["Matriculas_AFM", "CHMEm"], ["Matriculas_AFM", "CHMPor"]]) {
    ok((await escalar("SELECT COUNT(*) FROM sys.columns WHERE object_id = OBJECT_ID(@t) AND name = @c", { t: `dbo.${t}`, c })) === 1, `coluna ${t}.${c} existe`);
  }
  for (const ix of ["UX_CargosHist_Aberto", "UX_Consagracoes_EmAndamento"]) ok((await escalar("SELECT COUNT(*) FROM sys.indexes WHERE name = @i AND is_unique = 1 AND has_filter = 1", { i: ix })) === 1, `índice único filtrado ${ix}`);
  for (const c of ["CK_MembroReferencia_Sexo", "CK_CargosHist_Origem", "CK_CargosHist_Periodo", "CK_Consagracoes_Modalidade", "CK_Consagracoes_Veto", "CK_Matriculas_AFM_Origem"]) {
    ok((await escalar("SELECT COUNT(*) FROM sys.check_constraints WHERE name = @c AND is_disabled = 0 AND is_not_trusted = 0", { c })) === 1, `CHECK ${c} ligado e confiável`);
  }
  ok((await escalar("SELECT COUNT(*) FROM TiposConsagracao WHERE CargoMinisterialResultante IN ('AUXILIAR','MISSIONARIO','DIACONO','PRESBITERO','EVANGELISTA','PASTOR')")) === 6, "os 6 degraus têm tipo de consagração");
  ok((await escalar("SELECT COUNT(*) FROM (SELECT Nome FROM TiposConsagracao GROUP BY Nome HAVING COUNT(*) > 1) x")) === 0, "reaplicar não duplicou os tipos");
  ok((await escalar(`SELECT COUNT(*) FROM MembroReferencia m WHERE m.CargoMinisterial IN ('AUXILIAR','MISSIONARIO','DIACONO','PRESBITERO','EVANGELISTA','PASTOR')
                     AND NOT EXISTS (SELECT 1 FROM CargosMinisteriaisHistorico h WHERE h.MembroId = m.MembroId AND h.Ate IS NULL)`)) === 0, "a migração abriu a linha do cargo de todo oficial da base");
  ok((await escalar("SELECT COUNT(*) FROM (SELECT MembroId FROM CargosMinisteriaisHistorico WHERE Ate IS NULL GROUP BY MembroId HAVING COUNT(*) > 1) x")) === 0, "reaplicar não abriu duas linhas");
  ok((await escalar("SELECT COUNT(*) FROM Consagracoes WHERE Modalidade <> 'INDICACAO'")) === 0, "processos antigos ficaram como indicação");
  const erroCk = async (t, p) => { try { await q(t, p); return null; } catch (e) { return e.message; } };
  ok(/CK_MembroReferencia_Sexo/.test(await erroCk("UPDATE MembroReferencia SET Sexo = 'X' WHERE MembroId = 1002") || ""), "o banco recusa sexo fora de M/F");

  await E.montarCenario();
  const LID = LIDER();

  console.log("== candidato a Auxiliar: matrícula de candidato, CHM e a esteira ==");
  let r = guardar("requisitosCandidatoSemMatricula", await req(TIPO.AUXILIAR, P.candidato));
  ok(r.status === 200 && r.body.alvo === "AUXILIAR" && r.body.requisitos.bloqueado === true, "prévia: o candidato ainda não pode (sem matrícula)", r.body);
  ok(item(r, "matricula").situacao === "FALTA" && /Básico/.test(item(r, "matricula").detalhe), "o que falta: matrícula cursando o Básico (Art. 72, I, b)", item(r, "matricula"));
  ok(item(r, "idade").situacao === "ATENDE" && item(r, "membresia").situacao === "ATENDE", "idade e membresia atendem");
  r = await afmPost("matricular-candidato", { membroId: P.candidato, nivel: "BASICO", data: hoje });
  ok(r.status === 201 && r.body.sucesso, "a AFM matricula o candidato", r.body);
  ok((await um("SELECT Origem, StatusMatricula, NivelEscolaridade FROM Matriculas_AFM WHERE MembroId = @m", { m: P.candidato })).Origem === "CANDIDATO", "origem CANDIDATO");
  r = await afmPost("matricular-candidato", { membroId: P.candidato, nivel: "BASICO", data: hoje });
  ok(r.status === 422, "matricular de novo: recusado", r.body);
  r = await afmPost("matricular-candidato", { membroId: P.auxiliar, nivel: "BASICO", data: hoje });
  ok(r.status === 422 && /oficial/.test(r.body.mensagem), "oficial não é matriculado como candidato", r.body);
  r = await afmPost("chm", { membroId: P.candidato, conceder: true, data: hoje });
  ok(r.status === 200 && r.body.sucesso, "a AFM concede o CHM", r.body);
  const mc = await um("SELECT CertificadoHabilitacao, CONVERT(varchar(10), CHMEm, 120) AS CHMEm, CHMPor FROM Matriculas_AFM WHERE MembroId = @m", { m: P.candidato });
  ok(mc.CertificadoHabilitacao === true && mc.CHMEm === hoje && mc.CHMPor === 1002, "CHM gravado com data e quem concedeu", mc);
  r = guardar("requisitosCandidatoPronto", await req(TIPO.AUXILIAR, P.candidato, "INDICACAO", LID));
  ok(r.status === 200 && r.body.requisitos.bloqueado === false, "prévia do Dirigente: pode seguir", r.body.requisitos);
  r = guardar("protocoloCriado", await protocolar({ membroId: P.candidato, assunto: TIPO.AUXILIAR, proponenteMembroId: P.lider }, LID));
  ok(r.status === 201 && r.body.consagracao.cargoAlvo === "AUXILIAR" && r.body.consagracao.modalidade === "INDICACAO", "o Dirigente protocola (destino Auxiliar, indicação)", r.body);
  const idCand = r.body.consagracao.consagracaoId;
  const retrato = JSON.parse(await escalar("SELECT RequisitosRetrato FROM Consagracoes WHERE ConsagracaoId = @id", { id: idCand }));
  ok(retrato.alvo === "AUXILIAR" && retrato.em === hoje && retrato.itens.some(([k, s]) => k === "chm" && s === "ATENDE"), "o retrato dos requisitos fica no processo", retrato);
  r = await protocolar({ membroId: P.candidato, assunto: TIPO.AUXILIAR, proponenteMembroId: P.lider }, LID);
  ok(r.status === 409, "segundo processo da mesma pessoa em andamento: 409", r.body);
  r = await evoluir(idCand, "AVANCAR", LID);
  ok(r.status === 403, "o Dirigente não avança (Conselho/Plenário são do geral)");
  r = await concluir(idCand);
  ok(r.body && r.body.sucesso && r.body.novoStatus === "CONCLUIDO" && /Auxiliar/.test(r.body.mensagem), "a Secretaria conclui: agora é Auxiliar", r.body);
  ok((await cargo(P.candidato)) === "AUXILIAR", "cargo no cadastro: AUXILIAR");
  ok((await escalar("SELECT Funcao FROM MembroReferencia WHERE MembroId = @m", { m: P.candidato })) === TIPO.AUXILIAR, "Função = o assunto");
  let h = await aberta(P.candidato);
  ok(h && h.Cargo === "AUXILIAR" && h.Desde === hoje && h.Origem === "CONSAGRACAO" && String(h.ConsagracaoId).toLowerCase() === String(idCand).toLowerCase(), "histórico: AUXILIAR desde hoje, pela consagração", h);
  ok((await escalar("SELECT COUNT(*) FROM Matriculas_AFM WHERE MembroId = @m", { m: P.candidato })) === 1, "a matrícula de candidato continua a dele (nenhuma automática a mais)");
  const db = require(path.join(API, "shared/afmDb.js"));
  await db.garantirMatriculas(await obterPool());
  ok((await escalar("SELECT COUNT(*) FROM Matriculas_AFM WHERE MembroId = @m", { m: P.candidato })) === 1, "nem depois da rotina da matrícula automática");
  ok((await db.universoAFM(await obterPool())).some((m) => Number(m.membroId) === P.candidato), "agora a Academia o espera nas Sessões Magnas");

  console.log("== Auxiliar → Missionário(a): interstício pelo histórico; a queima de etapas ==");
  r = await protocolar({ membroId: P.auxiliar, assunto: TIPO.MISSIONARIO, proponenteMembroId: 1002 });
  ok(r.status === 201, "protocolo (1 ano como Auxiliar)", r.body);
  r = await concluir(r.body.consagracao.consagracaoId);
  ok(r.body.sucesso && (await cargo(P.auxiliar)) === "MISSIONARIO", "concluído: Missionário(a)");
  const hs = await historico(P.auxiliar);
  ok(hs.length === 2 && hs[0].Cargo === "AUXILIAR" && hs[0].Ate === hoje && hs[1].Cargo === "MISSIONARIO" && hs[1].Ate === null, "a linha de Auxiliar fecha hoje; a de Missionário abre", hs);
  r = await req(TIPO.DIACONO, P.auxiliar);
  ok(item(r, "intersticio").situacao === "FALTA" && /completa em/.test(item(r, "intersticio").detalhe), "Diácono amanhã? não: 2 anos como Missionário, diz quando completa", item(r, "intersticio"));
  r = await protocolar({ membroId: P.auxiliar, assunto: TIPO.PRESBITERO, proponenteMembroId: 1002 });
  ok(r.status === 200 && r.body.sucesso === false && (r.body.requisitos.itens.find((i) => i.chave === "degrau") || {}).situacao === "FALTA", "pular para Presbítero: vedada a queima de etapas", r.body);
  ok((await escalar("SELECT COUNT(*) FROM Consagracoes WHERE MembroId = @m AND Status = 'PROTOCOLADO'", { m: P.auxiliar })) === 0, "o processo travado nem nasce");

  console.log("== Missionário → Diácono; o teto das obreiras ==");
  r = await protocolar({ membroId: P.missionario, assunto: TIPO.DIACONO, proponenteMembroId: 1002 });
  ok(r.status === 201, "Missionário com batismo no Espírito Santo, 2 anos, Médio e CHM: protocola", r.body);
  r = await concluir(r.body.consagracao.consagracaoId);
  ok(r.body.sucesso && (await cargo(P.missionario)) === "DIACONO", "Diácono");
  r = guardar("requisitosTravados", await req(TIPO.DIACONO, P.missionaria));
  ok(r.body.requisitos.bloqueado && item(r, "sexo").situacao === "FALTA" && /patente máxima/.test(item(r, "sexo").detalhe), "Missionária não vai a Diácono (Art. 71, III)", item(r, "sexo"));
  r = await protocolar({ membroId: P.missionaria, assunto: TIPO.DIACONO, proponenteMembroId: 1002, modalidade: "NOMEACAO_PRESIDENCIAL", atoReferencia: "Ato 1/2026" });
  ok(r.body.sucesso === false && (r.body.requisitos.itens.find((i) => i.chave === "sexo") || {}).situacao === "FALTA", "nem por nomeação do Presidente (não é requisito técnico)", r.body.mensagem);

  console.log("== Nomeação direta do Pastor Presidente: dispensa o técnico; nivelamento obrigatório ==");
  r = await protocolar({ membroId: P.nomeado, assunto: TIPO.PRESBITERO, proponenteMembroId: 1002 });
  ok(r.body.sucesso === false && (r.body.requisitos.itens.find((i) => i.chave === "chm") || {}).situacao === "FALTA" && (r.body.requisitos.itens.find((i) => i.chave === "escolaridade") || {}).situacao === "FALTA", "por indicação, trava no CHM e na escolaridade", r.body.mensagem);
  r = await protocolar({ membroId: P.nomeado, assunto: TIPO.PRESBITERO, proponenteMembroId: P.lider, modalidade: "NOMEACAO_PRESIDENCIAL", atoReferencia: "Ato 2/2026" }, LID);
  ok(r.status === 403, "o Dirigente não registra nomeação do Presidente", r.body);
  r = await protocolar({ membroId: P.nomeado, assunto: TIPO.PRESBITERO, proponenteMembroId: 1001, modalidade: "NOMEACAO_PRESIDENCIAL" });
  ok(r.status === 400 && /ato/i.test(r.body.mensagem), "sem a referência do ato: 400", r.body);
  r = await protocolar({ membroId: P.nomeado, assunto: TIPO.PRESBITERO, proponenteMembroId: 1001, modalidade: "NOMEACAO_PRESIDENCIAL", atoReferencia: "Ato da Presidência nº 2/2026" });
  ok(r.status === 201 && r.body.requisitos.nivelamento === true, "a Secretaria registra a nomeação: passa, com nivelamento", r.body.requisitos);
  const idNom = r.body.consagracao.consagracaoId;
  guardar("listaEmAndamento", await chamarRota("ListarConsagracoes/index.js", { token: SEC() }));
  r = await afmPost("vetar", { consagracaoId: idNom, motivo: "Tentativa de vetar a nomeação direta" });
  ok(r.status === 422 && /Art\. 66 §4º/.test(r.body.mensagem), "a AFM não veta a nomeação do Presidente", r.body);
  r = await afmGet("vetaveis");
  ok(r.status === 200 && !r.body.itens.some((p) => String(p.consagracaoId).toLowerCase() === String(idNom).toLowerCase()), "a nomeação nem aparece entre os vetáveis");
  r = await concluir(idNom);
  ok(r.body.sucesso && r.body.nivelamento === true && /nivelamento/.test(r.body.mensagem), "concluída: avisa o nivelamento obrigatório", r.body);
  h = await aberta(P.nomeado);
  ok(h.Cargo === "PRESBITERO" && h.Origem === "NOMEACAO_PRESIDENCIAL", "histórico: origem nomeação do Presidente", h);
  r = guardar("matriculas", await afmGet("matriculas"));
  const mNom = r.body.itens.find((m) => Number(m.membroId) === P.nomeado);
  ok(mNom && mNom.nivelamento === true && mNom.nivelAtende === false, "na Academia: nivelamento obrigatório", mNom);
  await afmPost("nivel", { membroId: P.nomeado, nivel: "AVANCADO", concluido: false });
  r = await afmGet("matriculas");
  ok(r.body.itens.find((m) => Number(m.membroId) === P.nomeado).nivelamento === false, "atingiu o nível do cargo: sai do nivelamento");
  ok(r.body.itens.some((m) => Number(m.membroId) === P.candidato && m.chm === true && m.origem === "CANDIDATO"), "a lista traz o CHM e a origem");

  console.log("== Evangelista e Pastor: só por indicação do Presidente; outra convenção ==");
  r = await protocolar({ membroId: P.presbitero, assunto: TIPO.EVANGELISTA, proponenteMembroId: 1002 });
  ok(r.body.sucesso === false && (r.body.requisitos.itens.find((i) => i.chave === "prerrogativa") || {}).situacao === "FALTA", "indicação comum para Evangelista: trava (Art. 72, V, a)", r.body.mensagem);
  r = await protocolar({ membroId: P.presbitero, assunto: TIPO.EVANGELISTA, proponenteMembroId: 1001, modalidade: "NOMEACAO_PRESIDENCIAL", atoReferencia: "Ato 3/2026" });
  ok(r.status === 201 && (r.body.requisitos.itens.find((i) => i.chave === "ciadseta") || {}).situacao === "AVISO", "por nomeação: passa, com o aviso da CIADSETA", r.body.requisitos);
  r = await concluir(r.body.consagracao.consagracaoId);
  ok(r.body.sucesso && (await cargo(P.presbitero)) === "EVANGELISTA", "Evangelista");
  r = await protocolar({ membroId: P.forasteiro, assunto: TIPO.PASTOR, proponenteMembroId: 1002, modalidade: "OUTRA_CONVENCAO", atoReferencia: "Assembleia de Deus em Belém — CONAMAD" });
  ok(r.status === 201 && r.body.requisitos.itens.find((i) => i.chave === "degrau").situacao === "DISPENSADO", "ministro de outra convenção: degrau dispensado", r.body.requisitos);
  r = await concluir(r.body.consagracao.consagracaoId);
  ok(r.body.sucesso && (await cargo(P.forasteiro)) === "PASTOR" && (await aberta(P.forasteiro)).Origem === "OUTRA_CONVENCAO", "Pastor, origem outra convenção");
  const orgaoCLI = await escalar("SELECT OrgaoId FROM Orgaos WHERE Sigla = 'CLI'");
  const { composicaoCLI } = require(path.join(API, "shared/universo.js"));
  ok((await composicaoCLI(await obterPool(), orgaoCLI)).some((m) => Number(m.membroId) === P.forasteiro), "entra na CLI por Ordenação");
  r = guardar("listaConsagracoes", await chamarRota("ListarConsagracoes/index.js", { token: SEC() }));
  ok(Array.isArray(r.body), "lista das consagrações");

  console.log("== disciplina: trava; o motivo só ao nível geral ==");
  r = await req(TIPO.DIACONO, P.disciplinado);
  ok(item(r, "comunhao").situacao === "FALTA" && /disciplina/i.test(item(r, "comunhao").detalhe), "o geral vê: disciplina em curso", item(r, "comunhao"));
  r = await req(TIPO.DIACONO, P.disciplinado, "INDICACAO", LID);
  ok(item(r, "comunhao").situacao === "FALTA" && !/disciplina/i.test(item(r, "comunhao").detalhe), "o Dirigente vê só que não está apto", item(r, "comunhao"));
  r = await protocolar({ membroId: P.disciplinado, assunto: TIPO.DIACONO, proponenteMembroId: P.lider }, LID);
  ok(r.body.sucesso === false && !JSON.stringify(r.body).match(/disciplina/i), "no protocolo do Dirigente também não vaza", r.body);

  console.log("== data de entrada no cargo: só a Secretaria informa ==");
  r = await req(TIPO.PRESBITERO, P.legado);
  ok(item(r, "intersticio").situacao === "SEM_DADO", "Diácono sem data de entrada: falta o dado", item(r, "intersticio"));
  r = await salvarPessoa(P.legado, { cargoDesde: "2019-05-01" }, LID);
  ok(r.status === 403, "o Dirigente não informa 'no cargo desde'", r.body);
  r = await salvarPessoa(P.legado, { cargoDesde: "2019-05-01" });
  ok(r.status === 200 && r.body.sucesso !== false, "a Secretaria informa", r.body);
  h = await aberta(P.legado);
  ok(h.Desde === "2019-05-01" && h.Cargo === "DIACONO", "a linha aberta recebe a data", h);
  ok((await historico(P.legado)).length === 1, "sem linha a mais");
  r = await req(TIPO.PRESBITERO, P.legado);
  ok(item(r, "intersticio").situacao === "ATENDE" && r.body.requisitos.bloqueado === false, "agora pode seguir", r.body.requisitos);
  const pLeg = await pessoa(P.legado);
  ok(pLeg.cargoDesde === "2019-05-01", "o cadastro devolve 'no cargo desde'", pLeg.cargoDesde);
  contrato.pessoa = pLeg;
  r = await salvarPessoa(P.legado, { cargoDesde: "2099-01-01" });
  ok(r.body.sucesso === false && /futuro/.test(r.body.mensagem), "data no futuro: recusada", r.body);

  console.log("== cadastro: cargo e dízimo só no nível geral; sexo ==");
  r = await salvarPessoa(P.candidato, { cargoMinisterial: "PASTOR" }, LID);
  ok(r.status === 403 && (await cargo(P.candidato)) === "AUXILIAR", "o Dirigente não põe ninguém como Pastor pelo cadastro", r.body);
  r = await salvarPessoa(P.candidato, { telefone: "91999990000" }, LID);
  ok(r.status === 200 && r.body.sucesso !== false, "o Dirigente edita o telefone (cargo igual): passa", r.body);
  r = await salvarPessoa(P.candidato, { dizimistaFiel: false }, LID);
  ok(r.status === 403 && (await escalar("SELECT DizimistaFiel FROM MembroReferencia WHERE MembroId = @m", { m: P.candidato })) === true, "o Dirigente não mexe em 'dizimista fiel'", r.body);
  r = await chamarRota("GestaoPessoas/index.js", { metodo: "POST", token: LID, corpo: { membroId: 9230, nome: "Novo Pastor Forjado E2E", congregacaoId: await escalar("SELECT CongregacaoId FROM Congregacoes WHERE Nome = N'Central E2E'"), status: "ATIVO", cargoMinisterial: "PASTOR" } });
  ok(r.status === 403 && (await escalar("SELECT COUNT(*) FROM MembroReferencia WHERE MembroId = 9230")) === 0, "nem cria alguém já como Pastor", r.body);
  r = await salvarPessoa(P.semSexo, { sexo: "X" });
  ok(r.body.sucesso === false && /Sexo/.test(r.body.mensagem), "sexo fora de M/F: recusado", r.body);
  r = await salvarPessoa(P.menor, { cargoMinisterial: "AUXILIAR" });
  ok(r.status === 200 && (await cargo(P.menor)) === "AUXILIAR", "a Secretaria corrige o cargo pelo cadastro");
  h = await aberta(P.menor);
  ok(h && h.Cargo === "AUXILIAR" && h.Origem === "CADASTRO" && h.Desde === null, "histórico: origem cadastro, data a informar", h);
  r = await salvarPessoa(P.menor, { cargoMinisterial: null });
  ok((await cargo(P.menor)) === null && !(await aberta(P.menor)), "volta a membro: a linha fecha");
  const audCargo = await um("SELECT TOP 1 DadosDepois FROM Auditoria WHERE Tabela = 'MembroReferencia' AND RegistroId = @m ORDER BY AuditoriaId DESC", { m: String(P.menor) }).catch(() => null);
  ok(!audCargo || /cargoAnterior/.test(audCargo.DadosDepois || ""), "a auditoria guarda o cargo anterior", audCargo);

  console.log("== o menor não vai a Auxiliar; o inativo nem por nomeação ==");
  r = await req(TIPO.AUXILIAR, P.menor);
  ok(item(r, "idade").situacao === "FALTA", "16 anos: falta idade (Art. 72, I, a)", item(r, "idade"));
  r = await protocolar({ membroId: P.inativo, assunto: TIPO.PRESBITERO, proponenteMembroId: 1001, modalidade: "NOMEACAO_PRESIDENCIAL", atoReferencia: "Ato 4/2026" });
  ok(r.body.sucesso === false && (r.body.requisitos.itens.find((i) => i.chave === "matricula") || {}).situacao === "FALTA", "matrícula inativa: nem a nomeação passa", r.body.mensagem);

  console.log("== sexo informado; CHM revogado no meio do processo trava a etapa seguinte ==");
  r = await req(TIPO.DIACONO, P.semSexo);
  ok(item(r, "sexo").situacao === "SEM_DADO", "sem o sexo: falta o dado");
  await salvarPessoa(P.semSexo, { sexo: "M" });
  ok((await escalar("SELECT Sexo FROM MembroReferencia WHERE MembroId = @m", { m: P.semSexo })) === "M", "sexo gravado");
  r = await protocolar({ membroId: P.semSexo, assunto: TIPO.DIACONO, proponenteMembroId: 1002 });
  ok(r.status === 201, "protocolado", r.body);
  const idSemSexo = r.body.consagracao.consagracaoId;
  r = await evoluir(idSemSexo, "AVANCAR");
  ok(r.body.sucesso, "primeiro avanço");
  r = await afmPost("chm", { membroId: P.semSexo, conceder: false });
  ok(r.body.sucesso, "a AFM revoga o CHM", r.body);
  r = guardar("avancarTravado", await evoluir(idSemSexo, "AVANCAR"));
  ok(r.body.sucesso === false && (r.body.requisitos.itens.find((i) => i.chave === "chm") || {}).situacao === "FALTA", "o avanço seguinte trava no CHM", r.body.mensagem);
  ok((await escalar("SELECT Status FROM Consagracoes WHERE ConsagracaoId = @id", { id: idSemSexo })) === "EM_ANALISE_CONSELHO", "a etapa não mudou");
  r = await evoluir(idSemSexo, "REPROVAR");
  ok(r.body.sucesso, "reprovar nunca é travado");

  console.log("== veto técnico da AFM ==");
  r = await protocolar({ membroId: P.vetado, assunto: TIPO.MISSIONARIO, proponenteMembroId: P.lider }, LID);
  ok(r.status === 201, "o Dirigente indica", r.body);
  const idVet = r.body.consagracao.consagracaoId;
  r = guardar("vetaveis", await afmGet("vetaveis"));
  ok(r.body.itens.some((p) => String(p.consagracaoId).toLowerCase() === String(idVet).toLowerCase() && p.cargoAlvo === "MISSIONARIO"), "aparece entre os vetáveis");
  r = await afmPost("vetar", { consagracaoId: idVet, motivo: "curto" });
  ok(r.status === 400, "motivo curto: 400");
  r = await afmPost("vetar", { consagracaoId: idVet, motivo: "Reprovou na prova de liturgia do Seminário de novembro" });
  ok(r.status === 200 && r.body.sucesso, "a AFM veta", r.body);
  const cv = await um("SELECT Status, VetoAFMPor, VetoAFMMotivo, VetoAFMEm FROM Consagracoes WHERE ConsagracaoId = @id", { id: idVet });
  ok(cv.Status === "REPROVADO" && cv.VetoAFMPor === 1002 && /liturgia/.test(cv.VetoAFMMotivo) && cv.VetoAFMEm, "processo encerrado com o veto", cv);
  r = await afmPost("vetar", { consagracaoId: idVet, motivo: "Reprovou na prova de liturgia do Seminário de novembro" });
  ok(r.status === 409, "vetar de novo: 409");
  r = await evoluir(idVet, "AVANCAR");
  ok(r.body.sucesso === false, "o vetado não avança");
  r = await chamarRota("ListarConsagracoes/index.js", { token: LID });
  const lv = (r.body || []).find((c) => String(c.consagracaoId).toLowerCase() === String(idVet).toLowerCase());
  ok(lv && lv.vetoAFMEm && /liturgia/.test(lv.vetoAFMMotivo), "quem indicou vê o veto e o motivo na lista", lv);
  contrato.listaConsagracoes = r.body;
  r = await protocolar({ membroId: P.vetado, assunto: TIPO.MISSIONARIO, proponenteMembroId: P.lider }, LID);
  ok(r.status === 201, "nova indicação: só por novo protocolo (e pode)", r.body);
  await evoluir(r.body.consagracao.consagracaoId, "REPROVAR");

  console.log("== ninguém protocola nem avança a própria consagração ==");
  r = await protocolar({ membroId: 1002, assunto: TIPO.PASTOR, proponenteMembroId: 1002, modalidade: "NOMEACAO_PRESIDENCIAL", atoReferencia: "Ato 9/2026" });
  ok(r.status === 422, "a Secretaria não protocola a própria", r.body);
  r = await afmPost("chm", { membroId: 1002, conceder: true, data: hoje });
  ok(r.status === 422, "nem concede o próprio CHM", r.body);

  console.log("== vacância fecha o histórico; Meus Dados ==");
  r = await chamarRota("MeusDadosLGPD/index.js", { binding: { matricula: String(P.candidato) }, token: PIN(P.candidato) });
  ok(r.status === 200 && r.body.membro.sexo === "M" && r.body.escada.cargos.some((c) => c.cargo === "AUXILIAR" && c.desde === hoje && !c.ate), "Meus Dados: sexo e histórico de cargos", r.body.escada);
  r = await salvarPessoa(P.forasteiro, { status: "DESLIGADO", motivoSaida: "DESLIGAMENTO" });
  ok(r.status === 200, "desligado", r.body);
  ok((await cargo(P.forasteiro)) === null && !(await aberta(P.forasteiro)) && (await historico(P.forasteiro)).every((x) => x.Ate), "a vacância zera o cargo e fecha o histórico");
  const { minimizarCamposExMembro } = require(path.join(API, "shared/minimizacaoLgpd.js"));
  await minimizarCamposExMembro(await obterPool(), P.forasteiro, { dataSaida: hoje, motivo: "Carta de Mudança" });
  ok((await escalar("SELECT COUNT(*) FROM CargosMinisteriaisHistorico WHERE MembroId = @m", { m: P.forasteiro })) === 0 && (await escalar("SELECT Sexo FROM MembroReferencia WHERE MembroId = @m", { m: P.forasteiro })) === null, "a minimização apaga o histórico de cargos e o sexo");

  ok(falhasAuditoria === 0, "nenhuma falha de auditoria", falhasAuditoria);
  if (process.env.E2E_CONTRATO) {
    require("fs").writeFileSync(path.join(__dirname, "..", "front-escada", "contrato-real.json"), JSON.stringify(contrato, null, 2));
    console.log("contrato gravado em tools/front-escada/contrato-real.json");
  }
  fim("e2e-51 escada (fluxos)");
})().catch((e) => { console.log("ERRO", e); process.exit(1); });
