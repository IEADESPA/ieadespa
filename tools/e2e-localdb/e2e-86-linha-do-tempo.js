// e2e-86-linha-do-tempo.js — a linha do tempo ÚNICA da pessoa (FASE 10, v10.1b passo 2, 17/11/2026): shared/linhaDoTempo.js e as rotas
// GET /api/pessoas/{id}/linha-do-tempo (secretaria, no escopo; disciplina e abandono só com a permissão "disciplina" no escopo DELA) e
// GET /api/minha-linha-do-tempo/{matricula} (a própria pessoa, sem disciplina). Monta uma pessoa com eventos de TODOS os tipos e confere a ordem, as datas,
// quem vê o quê, que CPF/contato/código do QR nunca aparecem e a paginação; a rota antiga (/historico) continua respondendo igual.
// Roda sobre a base cenario-174 (`bash rodar.sh preparar-174` e depois `BASE=cenario-174 bash rodar.sh roteiro e2e-86-linha-do-tempo.js`); monta o próprio cenário.
process.env.AUTH_SECRET = "segredo-da-linha-do-tempo-e2e86-" + "x".repeat(24);
const L = require("./lib");
const { ok, fim, q, escalar, obterPool } = L;

const A1 = "Linha A1 E2E86", A2 = "Linha A2 E2E86", B1 = "Linha B1 E2E86";
const P = 860001, CONJUGE = 860002, OFICIANTE = 860003, READM = 860004, FALECIDO = 860005;
const CPF = "52998224725", TEL = "(00) 99999-8686", EMAIL = "pessoa86@exemplo.org", COD1 = "E2E86QRA01", COD2 = "E2E86QRB02";
const fator = () => ({ via: "CHAVE", em: Date.now() });
const lider = (id, permissoes, escopo, nivel = "CONGREGACAO", extra = {}) => L.sessao(id, { via: "SENHA", fator: fator(), nivel, escopoCongregacoes: escopo, permissoes, ...extra });

async function principal() {
  const { chamarRota } = require("./lib-afm");
  await obterPool();
  const linhaDe = (token, id, query) => chamarRota("LinhaDoTempoMembro/index.js", { metodo: "GET", token, binding: { membroId: String(id) }, query: query || {} });
  const minha = (token, id, query) => chamarRota("MinhaLinhaDoTempo/index.js", { metodo: "GET", token, binding: { matricula: String(id) }, query: query || {} });
  const tipos = (res) => ((res && res.body && res.body.eventos) || []).map((e) => e.tipo);
  const semSegredo = (res, rotulo) => { const t = JSON.stringify(res && res.body); ok(![CPF, "529.982", TEL, EMAIL, COD1, COD2].some((s) => t.includes(s)), `${rotulo}: nem CPF, nem telefone, nem e-mail, nem o código do QR`, t.slice(0, 200)); };

  console.log("== o cenário: duas áreas, três congregações e as pessoas ==");
  const area1 = (await q("INSERT INTO Areas (Nome) VALUES (N'Área Linha 1 E2E86'); SELECT CAST(SCOPE_IDENTITY() AS INT) AS id"))[0].id;
  const area2 = (await q("INSERT INTO Areas (Nome) VALUES (N'Área Linha 2 E2E86'); SELECT CAST(SCOPE_IDENTITY() AS INT) AS id"))[0].id;
  const cong = {};
  for (const [nome, area] of [[A1, area1], [A2, area1], [B1, area2]]) cong[nome] = (await q("INSERT INTO Congregacoes (Nome, AreaId) VALUES (@n, @a); SELECT CAST(SCOPE_IDENTITY() AS INT) AS id", { n: nome, a: area }))[0].id;
  for (const id of [860101, 860102, 860103, 860104, 860105, 860106, 860107]) {
    await q(`INSERT INTO MembroReferencia (MembroId, Nome, CongregacaoId, Status, SituacaoMembro) VALUES (@id, @n, @c, 'ATIVO', 'EM_COMUNHAO')`, { id, n: `Liderança ${id} E2E86`, c: cong[A1] });
  }
  await q(`INSERT INTO MembroReferencia (MembroId, Nome, CongregacaoId, Status, SituacaoMembro, FormaAdmissao, DataAdmissao, DataBatismo, DataRitoRecebimento, MinistranteRito, Cpf, Telefone, Email)
           VALUES (@p, N'Pessoa Linha E2E86', @c, 'ATIVO', 'EM_COMUNHAO', 'BATISMO', '2015-04-12', '2015-04-12', '2015-05-03', N'Pr. Rito E2E86', @cpf, @tel, @em)`,
  { p: P, c: cong[A1], cpf: CPF, tel: TEL, em: EMAIL });
  await q(`INSERT INTO MembroReferencia (MembroId, Nome, CongregacaoId, Status, SituacaoMembro) VALUES (@a, N'Cônjuge Linha E2E86', @c, 'ATIVO', 'EM_COMUNHAO'), (@b, N'Oficiante Linha E2E86', @c, 'ATIVO', 'EM_COMUNHAO')`,
    { a: CONJUGE, b: OFICIANTE, c: cong[A1] });
  await q(`INSERT INTO MembroReferencia (MembroId, Nome, CongregacaoId, Status, SituacaoMembro, FormaAdmissao, DataAdmissao, DataSaida, MotivoSaida)
           VALUES (@id, N'Readmitida Linha E2E86', @c, 'ATIVO', 'EM_COMUNHAO', 'RECONCILIACAO', '2025-01-10', '2024-05-05', 'EXCLUSAO')`, { id: READM, c: cong[A1] });
  await q(`INSERT INTO MembroReferencia (MembroId, Nome, CongregacaoId, Status, SituacaoMembro, DataAdmissao, DataSaida, MotivoSaida)
           VALUES (@id, N'Falecida Linha E2E86', @c, 'FALECIDO', 'SEM_COMUNHAO', '2001-01-01', '2026-01-02', 'FALECIMENTO')`, { id: FALECIDO, c: cong[A1] });

  // os eventos da pessoa P, de todos os tipos
  await q(`INSERT INTO MarcosMembro (MembroId, Tipo, Descricao, DataMarco, DataAproximada) VALUES
           (@p, N'CONVERSAO', N'Igreja Batista Esperança E2E86', '1998-03-01', 1), (@p, N'BATISMO_ESPIRITO_SANTO', N'culto de oração E2E86', '2016-09-20', 0),
           (@p, N'CURSO_DISCIPULADO', N'turma de 2014 E2E86', NULL, 0)`, { p: P });
  const consId = (await q(`INSERT INTO Consagracoes (MembroId, Assunto, CargoAtual, Status, DataProtocolo, DataConclusao) OUTPUT inserted.ConsagracaoId AS id
           VALUES (@p, N'Diaconato E2E86', 'DIACONO', 'CONCLUIDO', '2020-02-01', '2021-10-17')`, { p: P }))[0].id;
  await q(`INSERT INTO CargosMinisteriaisHistorico (MembroId, Cargo, Desde, Ate, Origem) VALUES (@p, 'AUXILIAR', '2018-01-01', '2021-10-16', 'CADASTRO')`, { p: P });
  await q(`INSERT INTO CargosMinisteriaisHistorico (MembroId, Cargo, Desde, Origem, ConsagracaoId) VALUES (@p, 'DIACONO', '2021-10-17', 'CONSAGRACAO', @c)`, { p: P, c: consId });
  await q(`INSERT INTO Casamentos (MembroId, MembroConjugeId, Celebrante, Modalidade, DataCasamento) VALUES (@p, @c, N'Pr. Celebrante E2E86', 'CIVIL_E_RELIGIOSO', '2019-02-20')`, { p: P, c: CONJUGE });
  await q(`INSERT INTO ApresentacoesCrianca (NomeCrianca, DataNascimento, MembroIdMae, Oficiante, Modalidade, DataApresentacao) VALUES (N'Lia E2E86', '2021-01-01', @p, N'Pr. Apresentação E2E86', 'SOLENE', '2021-06-06')`, { p: P });
  const turma = (await q(`INSERT INTO TurmasBatismo (DataBatismo, Local, TipoLocal, Status, CongregacaoId) VALUES ('2015-04-12', N'Templo Sede E2E86', 'TEMPLO', 'REALIZADA', @c); SELECT CAST(SCOPE_IDENTITY() AS INT) AS id`, { c: cong[A1] }))[0].id;
  await q(`INSERT INTO OficiantesBatismo (TurmaId, MembroId) VALUES (@t, @o)`, { t: turma, o: OFICIANTE });
  await q(`INSERT INTO CandidatosBatismo (MembroId, TurmaId, Status, DataInscricao) VALUES (@p, @t, 'BATIZADO', '2015-02-01T15:00:00')`, { p: P, t: turma });
  await q(`INSERT INTO CartasTransito (MembroId, Tipo, DataEmissao, Destino) VALUES (@p, 'RECOMENDACAO', '2022-01-10', N'Igreja Irmã E2E86')`, { p: P });
  await q(`INSERT INTO CredenciaisEclesiasticas (MembroId, Via, Codigo, Situacao, EmitidaEm, EncerradaEm, MotivoEncerramento) VALUES
           (@p, 1, @c1, 'SUBSTITUIDA', '2021-11-01T15:00:00', '2023-03-01T15:00:00', N'perdeu a carteira E2E86'),
           (@p, 2, @c2, 'CANCELADA', '2023-03-01T15:00:00', '2024-05-05T15:00:00', N'Recolhida por decisão disciplinar E2E86')`, { p: P, c1: COD1, c2: COD2 });
  await q(`INSERT INTO LicencasCandidatura (MembroId, DataPleito, DataInicioLicenca, Status, DataRetornoDecidida) VALUES (@p, '2024-10-06', '2024-07-08', 'RETORNOU', '2024-11-01')`, { p: P });
  await q(`INSERT INTO ProcessosDisciplinares (MembroId, DataAbertura, DataConclusao, Status, Resultado) VALUES (@p, '2024-04-01', '2024-04-20', 'JULGADO', 'ADVERTENCIA'),
           (@r, '2024-03-01', '2024-05-05', 'JULGADO', 'EXCLUSAO')`, { p: P, r: READM });
  await q(`INSERT INTO ProcedimentosAbandono (MembroId, Tipo, DataNotificacao) VALUES (@p, 'MATERIAL', '2023-08-01')`, { p: P });

  const geral = lider(860101, ["pessoas"], "TODAS", "GLOBAL");
  const geralDisc = lider(860102, ["pessoas", "disciplina"], "TODAS", "GLOBAL");
  const area = lider(860103, ["pessoas"], [A1, A2], "AREA");
  const localA1 = lider(860104, ["pessoas"], [A1]);
  const localB1 = lider(860105, ["pessoas"], [B1]);
  const localDisc = lider(860106, ["pessoas", "disciplina"], [A1]);
  const discFora = lider(860107, ["pessoas", "disciplina"], [A1], "CONGREGACAO", {
    concessoes: [{ permissoes: ["pessoas"], escopoCongregacoes: [A1], nivel: "CONGREGACAO" }, { permissoes: ["disciplina"], escopoCongregacoes: [B1], nivel: "CONGREGACAO" }] });

  console.log("== a Secretaria Geral (sem disciplina): todos os tipos, mais recente primeiro ==");
  const g = await linhaDe(geral, P);
  ok(g.status === 200 && g.body.sucesso === true && g.body.nome === "Pessoa Linha E2E86", "a Geral abre a linha do tempo", JSON.stringify(g.body).slice(0, 200));
  const tg = tipos(g);
  for (const t of ["CONVERSAO", "BATISMO_ESPIRITO_SANTO", "MARCO", "BATISMO_INSCRICAO", "BATISMO_AGUAS", "ADMISSAO", "RITO_RECEBIMENTO", "CONSAGRACAO_PROTOCOLO", "CONSAGRACAO_CONCLUIDA",
    "CARGO_INICIO", "CARGO_FIM", "CASAMENTO", "APRESENTACAO", "CARTA_TRANSITO", "CREDENCIAL_EMITIDA", "CREDENCIAL_ENCERRADA", "LICENCA_INICIO", "LICENCA_FIM"]) {
    ok(tg.includes(t), `tem o evento ${t}`);
  }
  const datas = g.body.eventos.map((e) => e.data).filter(Boolean);
  ok(JSON.stringify(datas) === JSON.stringify(datas.slice().sort().reverse()), "as datas vêm da mais recente para a mais antiga");
  ok(g.body.eventos[g.body.eventos.length - 1].data === null && g.body.eventos[g.body.eventos.length - 1].titulo === "Curso de Discipulado", "o evento sem data fica no fim");
  ok(!g.body.eventos.some((e) => e.categoria === "DISCIPLINA"), "sem a permissão disciplina: nenhum processo nem abandono");
  ok(g.body.eventos.filter((e) => e.tipo === "BATISMO_AGUAS").length === 1, "o batismo da turma não se repete com a data da ficha");
  const bat = g.body.eventos.find((e) => e.tipo === "BATISMO_AGUAS");
  ok(bat.data === "2015-04-12" && bat.detalhe === "Templo Sede E2E86 · oficiado por Oficiante Linha E2E86", "o batismo com o local e o oficiante", JSON.stringify(bat));
  ok(g.body.eventos.find((e) => e.tipo === "BATISMO_INSCRICAO").data === "2015-02-01", "a inscrição no batismo no dia de Brasília");
  const cargos = g.body.eventos.filter((e) => e.tipo === "CARGO_INICIO").map((e) => e.titulo);
  ok(JSON.stringify(cargos) === JSON.stringify(["No cargo de Auxiliar"]), "o cargo que veio de consagração não se repete (já está na consagração)", JSON.stringify(cargos));
  ok(g.body.eventos.find((e) => e.tipo === "CASAMENTO").titulo === "Casamento com Cônjuge Linha E2E86", "o casamento com o nome do cônjuge");
  const recolhida = g.body.eventos.find((e) => e.titulo === "Credencial recolhida (2ª via)");
  ok(recolhida && recolhida.detalhe === null && recolhida.data === "2024-05-05", "a credencial recolhida SEM o motivo (disciplinar) para quem não tem disciplina");
  const ve = g.body.vidaEspiritual;
  ok(ve.conversao && ve.conversao.data === "1998-03-01" && ve.conversao.aproximada === true, "a conversão à vista (data aproximada)", JSON.stringify(ve));
  ok(ve.batismoEspiritoSanto && ve.batismoEspiritoSanto.data === "2016-09-20", "o batismo no Espírito Santo à vista");
  ok(ve.batismoAguas && ve.batismoAguas.local === "Templo Sede E2E86" && ve.batismoAguas.oficiantes === "Oficiante Linha E2E86", "o batismo nas águas à vista, com local e oficiante");
  ok(ve.procedencia && ve.procedencia.formaAdmissao === "por batismo" && ve.procedencia.dataAdmissao === "2015-04-12", "a procedência à vista");
  semSegredo(g, "Geral");

  console.log("== com a permissão disciplina no escopo: processos, abandono e o motivo ==");
  const gd = await linhaDe(geralDisc, P);
  const disc = gd.body.eventos.filter((e) => e.categoria === "DISCIPLINA").map((e) => e.tipo).sort();
  ok(JSON.stringify(disc) === JSON.stringify(["ABANDONO_NOTIFICACAO", "DISCIPLINA_ABERTURA", "DISCIPLINA_CONCLUSAO"]), "a Geral com disciplina vê os processos e o abandono", JSON.stringify(disc));
  ok(gd.body.eventos.find((e) => e.titulo === "Credencial recolhida (2ª via)").detalhe === "Recolhida por decisão disciplinar E2E86", "e o motivo do recolhimento");
  ok(gd.body.total === g.body.total + 3, "a diferença são só os 3 eventos de disciplina", `${gd.body.total} × ${g.body.total}`);
  semSegredo(gd, "Geral com disciplina");
  const ld = await linhaDe(localDisc, P);
  ok(ld.body.eventos.some((e) => e.tipo === "DISCIPLINA_ABERTURA"), "a local de A1 com disciplina em A1 também vê");
  const df = await linhaDe(discFora, P);
  ok(df.body.sucesso === true && !df.body.eventos.some((e) => e.categoria === "DISCIPLINA"), "disciplina só em OUTRA congregação (B1): a linha abre (pessoas em A1), sem disciplina");

  console.log("== a escala: área, local dentro e fora do escopo ==");
  const ar = await linhaDe(area, P);
  ok(ar.body.sucesso === true && ar.body.total === g.body.total, "a área (A1 e A2) vê a mesma linha que a Geral");
  const la = await linhaDe(localA1, P);
  ok(la.body.sucesso === true && la.body.total === g.body.total, "a local de A1 vê");
  const lb = await linhaDe(localB1, P);
  const naoExiste = await linhaDe(geral, 869999);
  const lixo = await linhaDe(geral, "1;DROP TABLE x");
  ok(lb.body.sucesso === false && JSON.stringify(lb.body) === JSON.stringify(naoExiste.body) && JSON.stringify(lixo.body) === JSON.stringify(naoExiste.body),
    "a local de B1 (fora do escopo) recebe o MESMO 'não encontrada' de uma matrícula que não existe e de lixo", JSON.stringify(lb.body));
  const semPerm = await linhaDe(lider(860104, ["eventos"], [A1]), P);
  const semSessao = await linhaDe(undefined, P);
  ok(semPerm.status === 403 && semSessao.status === 401, "sem a permissão pessoas: 403; sem sessão: 401", `${semPerm.status} ${semSessao.status}`);

  console.log("== a própria pessoa: a linha inteira, sem disciplina ==");
  const eu = await minha(L.PIN(P), P);
  ok(eu.status === 200 && eu.body.sucesso === true && eu.body.total === g.body.total, "a própria pessoa vê a sua linha inteira (o mesmo que a Geral sem disciplina)", `${eu.body.total} × ${g.body.total}`);
  ok(!eu.body.eventos.some((e) => e.categoria === "DISCIPLINA"), "sem disciplina na própria linha");
  ok(JSON.stringify(eu.body.vidaEspiritual) === JSON.stringify(g.body.vidaEspiritual), "a mesma vida espiritual à vista");
  semSegredo(eu, "a própria pessoa");
  const outra = await minha(L.PIN(CONJUGE), P);
  const anonimo = await minha(undefined, P);
  ok(outra.status === 403 && anonimo.status === 401, "a linha de outra pessoa: 403; sem sessão: 401", `${outra.status} ${anonimo.status}`);

  console.log("== readmissão, falecimento e o casamento visto pelo cônjuge ==");
  const r1 = await linhaDe(geral, READM);
  const textoR1 = JSON.stringify(r1.body);
  ok(r1.body.eventos.find((e) => e.tipo === "READMISSAO").titulo === "Readmissão no rol de membros" && r1.body.eventos.find((e) => e.tipo === "SAIDA").titulo === "Saída do rol de membros",
    "sem disciplina: 'Readmissão' e 'Saída do rol', sem dizer por quê", textoR1.slice(0, 300));
  ok(!/exclus|disciplin|abandono/i.test(textoR1), "nenhuma palavra de disciplina na resposta");
  const r2 = await linhaDe(geralDisc, READM);
  ok(r2.body.eventos.find((e) => e.tipo === "READMISSAO").titulo === "Readmissão no rol de membros (depois de exclusão)" && r2.body.eventos.find((e) => e.tipo === "SAIDA").titulo === "Saída do rol: exclusão",
    "com disciplina: a readmissão depois de exclusão e o motivo da saída");
  const f1 = await linhaDe(geral, FALECIDO);
  ok(f1.body.eventos[0].tipo === "FALECIMENTO" && f1.body.eventos[0].data === "2026-01-02", "o falecimento no alto da linha");
  const cj = await linhaDe(geral, CONJUGE);
  ok(cj.body.eventos.some((e) => e.tipo === "CASAMENTO" && e.titulo === "Casamento com Pessoa Linha E2E86"), "o mesmo casamento aparece na linha do cônjuge, com o nome dela");

  console.log("== a paginação ==");
  const total = g.body.total;
  let juntos = [];
  for (let pg = 1; pg <= Math.ceil(total / 5); pg++) juntos = juntos.concat((await linhaDe(geral, P, { pagina: String(pg), porPagina: "5" })).body.eventos);
  ok(JSON.stringify(juntos) === JSON.stringify(g.body.eventos), `as páginas de 5 juntas dão a linha inteira (${total} eventos)`);
  ok((await linhaDe(geral, P, { porPagina: "9999" })).body.porPagina === 200, "o teto de 200 por página");
  const alem = await linhaDe(geral, P, { pagina: "999", porPagina: "5" });
  ok(alem.body.eventos.length === 0 && alem.body.total === total, "uma página além do fim vem vazia, com o total");
  const torto = await linhaDe(geral, P, { pagina: "-3", porPagina: "abc" });
  ok(torto.body.pagina === 1 && torto.body.porPagina === 50, "valores tortos viram a primeira página de 50");

  console.log("== a rota antiga (/historico) continua igual para a tela de hoje ==");
  const antigo = await chamarRota("HistoricoMembro/index.js", { metodo: "GET", token: geral, binding: { membroId: String(P) } });
  ok(antigo.status === 200 && antigo.body.nome === "Pessoa Linha E2E86" && Array.isArray(antigo.body.eventos) && antigo.body.eventos.some((e) => e.tipo === "ADMISSAO"),
    "o /historico responde no formato de antes ({ nome, eventos })");

  const linhasNoBanco = await escalar("SELECT COUNT(*) FROM CredenciaisEclesiasticas WHERE MembroId = @p", { p: P });
  ok(linhasNoBanco === 2, "nada foi gravado pelas leituras (as credenciais continuam 2)");
  fim("e2e-86 (a linha do tempo única da pessoa)");
}

principal().catch((e) => { console.log("ERRO", e.message, e.stack); fim("e2e-86 (abortado)"); });
