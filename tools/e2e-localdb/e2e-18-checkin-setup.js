// e2e-18-checkin-setup.js — v7.10 (Check-in infantil com cadeia de custódia): as garantias da migração 145 (esquema, CHECK, gatilhos, índices únicos, o portão da EBD, prazos, avisos obrigatórios,
// retenção, idempotência) e o cenário dos roteiros e2e-19 a e2e-22, sobre a base da v7.8 (cenario-protecao, com as pessoas e equipes da v7.7: voluntários 6001-6027, Berçário e Maternal da Central).
// Os registros de teste dos gatilhos são APAGADOS no fim (com os gatilhos desligados só durante a limpeza), para a base salva sair limpa.
const fs = require("fs");
const H = require("./lib-checkin");
const { L, q, um, escalar, falha, hoje } = H;
const { ok, fim, API, path, obterPool } = L;
const erroFatal = H.erroFatal;
const nega = async (descricao, texto, params, padrao) => { const m = await falha(texto, params); ok(m && padrao.test(m), descricao, m); return m; };
const aceita = async (descricao, texto, params) => { const m = await falha(texto, params); ok(m === null, descricao, m); return m === null; };
const iso = (s) => new Date(`${s}T00:00:00Z`);

(async () => {
  const pool = await obterPool();
  const c1 = await escalar("SELECT CongregacaoId FROM Congregacoes WHERE Nome = N'Central E2E'");
  const c2 = await escalar("SELECT CongregacaoId FROM Congregacoes WHERE Nome = N'Vila Nova E2E'");
  const c3 = await escalar("SELECT CongregacaoId FROM Congregacoes WHERE Nome = N'Beta E2E'");
  const eqId = (n) => escalar("SELECT EquipeId FROM EscalasEquipes WHERE Nome = @n", { n });
  const eq = { bercario: await eqId("Bercario M7"), maternal: await eqId("Maternal M7"), recepcao: await eqId("Recepcao M7"), infantilVila: await eqId("Infantil Vila M7") };
  ok(!!c1 && !!c2 && !!c3 && Object.values(eq).every(Boolean), "o cenário-base existe (3 congregações e as equipes da v7.7)", { c1, c2, c3, eq });

  console.log("== migração 145: esquema ==");
  for (const t of H.TABELAS_CK) ok((await escalar("SELECT COUNT(*) FROM sys.tables WHERE name = @t", { t })) === 1, `tabela ${t} existe`);
  for (const g of ["TR_CheckinRegistros_Protegido", "TR_CheckinEventos_Imutavel", "TR_CheckinAutorizados_SemApagar", "TR_CheckinVias_SemApagar"]) {
    ok((await escalar("SELECT COUNT(*) FROM sys.triggers WHERE name = @t AND is_disabled = 0", { t: g })) === 1, `gatilho ${g} existe e está ligado`);
  }
  for (const [ix, tab] of [["UX_CheckinReg_MenorEmSala", "CheckinInfantilRegistros"], ["UX_CheckinVol_Presente", "CheckinInfantilVoluntarios"], ["UX_CheckinVol_UmaSala", "CheckinInfantilVoluntarios"], ["UX_CheckinAut_MembroAtivo", "CheckinInfantilAutorizados"], ["UX_CheckinVia_Pendente", "CheckinInfantilSegundasVias"]]) {
    ok((await escalar("SELECT COUNT(*) FROM sys.indexes WHERE name = @i AND object_id = OBJECT_ID(@t) AND is_unique = 1 AND has_filter = 1", { i: ix, t: "dbo." + tab })) === 1, `índice único filtrado ${ix} existe`);
  }
  for (const [ix, tab] of [["IX_CheckinReg_Sala", "CheckinInfantilRegistros"], ["IX_CheckinReg_Menor", "CheckinInfantilRegistros"], ["IX_CheckinReg_Pendentes", "CheckinInfantilRegistros"], ["IX_CheckinEv_Registro", "CheckinInfantilEventos"],
    ["IX_CheckinEv_Sala", "CheckinInfantilEventos"], ["IX_CheckinVol_Sala", "CheckinInfantilVoluntarios"], ["IX_CheckinAut_Menor", "CheckinInfantilAutorizados"], ["IX_CheckinAutVisita_Registro", "CheckinInfantilAutorizadosVisita"]]) {
    ok((await escalar("SELECT COUNT(*) FROM sys.indexes WHERE name = @i AND object_id = OBJECT_ID(@t)", { i: ix, t: "dbo." + tab })) === 1, `índice ${ix} existe`);
  }
  const CHECKS = ["CK_CheckinReg_Idade", "CK_CheckinReg_Faixa", "CK_CheckinReg_TrouxeDoc", "CK_CheckinReg_SaudeOrigem", "CK_CheckinReg_Sit", "CK_CheckinReg_RetTipo", "CK_CheckinReg_RetDoc", "CK_CheckinReg_Crianca", "CK_CheckinReg_Trouxe",
    "CK_CheckinReg_Saude", "CK_CheckinReg_Estado", "CK_CheckinReg_Tentativas", "CK_CheckinEv_Tipo", "CK_CheckinVol_Saida", "CK_CheckinAut_Forma", "CK_CheckinAut_Ficha", "CK_CheckinAut_Revogacao", "CK_CheckinAut_NaoSiMesmo",
    "CK_CheckinSaude_Forma", "CK_CheckinSaude_Ficha", "CK_CheckinSaude_Texto", "CK_CheckinVia_Tipo", "CK_CheckinVia_Doc", "CK_CheckinVia_Dois", "CK_CheckinVia_Conf", "CK_CheckinVia_Cancel", "CK_MenoresRetiradas_Origem"];
  for (const c of CHECKS) ok((await escalar("SELECT COUNT(*) FROM sys.check_constraints WHERE name = @c AND is_disabled = 0 AND is_not_trusted = 0", { c })) === 1, `CHECK ${c} existe, ligado e confiável`);

  console.log("== o portão da EBD (colunas e CHECK) ==");
  ok((await escalar("SELECT COUNT(*) FROM sys.columns c JOIN sys.types t ON t.user_type_id = c.user_type_id WHERE c.object_id = OBJECT_ID('dbo.EbdTurmas') AND c.name = 'ContatoComMenores' AND t.name = 'bit' AND c.is_nullable = 0")) === 1, "EbdTurmas.ContatoComMenores: bit NOT NULL");
  ok((await escalar("SELECT COUNT(*) FROM sys.default_constraints d JOIN sys.columns c ON c.default_object_id = d.object_id WHERE c.object_id = OBJECT_ID('dbo.EbdTurmas') AND c.name = 'ContatoComMenores' AND d.definition LIKE '%0%'")) === 1, "a marca nasce DESLIGADA (default 0): nada muda sozinho");
  ok((await escalar("SELECT COUNT(*) FROM sys.columns WHERE object_id = OBJECT_ID('dbo.MinisterioMenoresRetiradas') AND name = 'TurmaId' AND is_nullable = 1")) === 1, "MinisterioMenoresRetiradas.TurmaId existe e aceita nulo");
  ok((await escalar("SELECT COUNT(*) FROM sys.foreign_keys fk JOIN sys.foreign_key_columns fc ON fc.constraint_object_id = fk.object_id WHERE fk.parent_object_id = OBJECT_ID('dbo.MinisterioMenoresRetiradas') AND fk.referenced_object_id = OBJECT_ID('dbo.EbdTurmas')")) === 1, "TurmaId aponta para EbdTurmas (chave estrangeira)");
  ok((await escalar("SELECT COUNT(*) FROM sys.columns WHERE object_id = OBJECT_ID('dbo.MinisterioMenoresRetiradas') AND name = 'EquipeId' AND is_nullable = 1")) === 1, "EquipeId passou a aceitar nulo (a retirada é de uma equipe OU de uma turma)");
  const turma = (await q("INSERT INTO EbdTurmas (CongregacaoId, Nome) VALUES (@c, N'Turma Gatilho E2E'); SELECT CAST(SCOPE_IDENTITY() AS INT) AS id", { c: c1 }))[0].id;
  ok((await escalar("SELECT ContatoComMenores FROM EbdTurmas WHERE TurmaId = @t", { t: turma })) === false, "uma turma nova nasce sem a marca 'com menores'");
  await nega("retirada sem equipe e sem turma é recusada", "INSERT INTO MinisterioMenoresRetiradas (MembroId, EquipeId, TurmaId, Motivos, AlocacoesCanceladas) VALUES (6010, NULL, NULL, N'X', 1)", {}, /CK_MenoresRetiradas_Origem/);
  await nega("retirada de equipe E de turma ao mesmo tempo é recusada", "INSERT INTO MinisterioMenoresRetiradas (MembroId, EquipeId, TurmaId, Motivos, AlocacoesCanceladas) VALUES (6010, @e, @t, N'X', 1)", { e: eq.bercario, t: turma }, /CK_MenoresRetiradas_Origem/);
  await aceita("retirada só de equipe passa (como na v7.7)", "INSERT INTO MinisterioMenoresRetiradas (MembroId, EquipeId, Motivos, AlocacoesCanceladas) VALUES (6010, @e, N'TESTE145', 1)", { e: eq.bercario });
  await aceita("retirada só de turma da EBD passa", "INSERT INTO MinisterioMenoresRetiradas (MembroId, TurmaId, Motivos, AlocacoesCanceladas) VALUES (6010, @t, N'TESTE145', 1)", { t: turma });
  await nega("turma que não existe é recusada (chave estrangeira)", "INSERT INTO MinisterioMenoresRetiradas (MembroId, TurmaId, Motivos, AlocacoesCanceladas) VALUES (6010, 999999, N'TESTE145', 1)", {}, /FOREIGN KEY/);
  await nega("a retirada registrada continua não se alterando (gatilho da v7.7)", "UPDATE MinisterioMenoresRetiradas SET AlocacoesCanceladas = 9 WHERE Motivos = N'TESTE145'", {}, /histórico/);

  console.log("== migração 145: prazos, avisos obrigatórios, retenção ==");
  const prazos = Object.fromEntries((await q("SELECT Sigla, Dias FROM Prazos WHERE Sigla LIKE 'CHECKIN[_]%'")).map((p) => [p.Sigla, p.Dias]));
  ok(Object.keys(prazos).length === 4 && prazos.CHECKIN_ABRE_MINUTOS_ANTES === 60 && prazos.CHECKIN_FECHA_HORAS_DEPOIS === 5 && prazos.CHECKIN_TENTATIVAS_CODIGO === 5 && prazos.CHECKIN_VISITANTE_CONTATO_DIAS === 90,
    "os 4 prazos nascem com 60 minutos, 5 horas, 5 tentativas e 90 dias", prazos);
  const regras = await q("SELECT Chave, Obrigatoria, CanalEmail, Categoria, PermissaoAlvo, Ativa FROM NotificacaoRegras WHERE Chave IN ('CHECKIN_RETIRADA_DIVERGENTE', 'CHECKIN_SEGUNDA_VIA', 'CHECKIN_SEM_RETIRADA', 'EBD_PROFESSOR_RETIRADO')");
  ok(regras.length === 4, "as 4 regras de aviso existem", regras.map((r) => r.Chave));
  ok(regras.every((r) => r.Obrigatoria === true && r.CanalEmail === true && r.Ativa === true && r.Categoria === "MENORES" && r.PermissaoAlvo === null), "todas obrigatórias (o destinatário não desliga), por e-mail, ativas, de menores e sem permissão-alvo (o ato diz quem avisa)", regras);
  ok((await escalar("SELECT COUNT(*) FROM PoliticasRetencao WHERE Categoria = N'Check-in infantil (entrega e retirada de crianças)' AND DiasRetencao = 1825 AND Ativo = 1 AND LEN(BaseLegal) BETWEEN 100 AND 300")) === 1,
    "a política de retenção (5 anos) está lá e o texto cabe na coluna (300 caracteres)", await escalar("SELECT LEN(BaseLegal) FROM PoliticasRetencao WHERE Categoria = N'Check-in infantil (entrega e retirada de crianças)'"));
  ok(!/^x$/.test(await escalar("SELECT BaseLegal FROM PoliticasRetencao WHERE Categoria = N'Check-in infantil (entrega e retirada de crianças)'")), "e a base legal não ficou com o texto provisório");

  console.log("== CHECK e gatilhos: o registro da criança ==");
  const sv = await H.servico(c1), sv2 = await H.servico(c1);
  await H.adulto(7020, "Adulto Gatilho E2E", c1); await H.crianca({ id: 7021, nome: "Crianca Gatilho A E2E", idade: 4, cong: c1 }); await H.crianca({ id: 7022, nome: "Crianca Gatilho B E2E", idade: 3, cong: c1 });
  function montar(over = {}, tabela = "CheckinInfantilRegistros", padrao = null) {
    const d = padrao || { ServicoId: sv, EquipeId: eq.maternal, CongregacaoId: c1, MenorMembroId: null, VisitanteNome: "Visitante Gatilho", VisitanteNascimento: iso("2022-01-01"), IdadeAnos: 4, FaixaSala: "MATERNAL", TrouxeNome: "Quem Trouxe", TrouxeDocumento: "RG", CodigoHash: "a".repeat(64), EntreguePorMembroId: 6010 };
    const todos = { ...d, ...over };
    const cols = Object.keys(todos);
    const params = {}; cols.forEach((k, i) => { params["p" + i] = todos[k]; });
    return { texto: `INSERT INTO ${tabela} (${cols.join(", ")}) VALUES (${cols.map((_, i) => "@p" + i).join(", ")}); SELECT CAST(SCOPE_IDENTITY() AS INT) AS id`, params };
  }
  const ins = async (over, tabela, padrao) => { const m = montar(over, tabela, padrao); return (await q(m.texto, m.params))[0].id; };
  const insFalha = async (descricao, over, padrao) => { const m = montar(over); const msg = await falha(m.texto, m.params); ok(msg && padrao.test(msg), descricao, msg); };
  await insFalha("idade 18 não é criança (CHECK)", { IdadeAnos: 18 }, /CK_CheckinReg_Idade/);
  await insFalha("idade negativa é recusada", { IdadeAnos: -1 }, /CK_CheckinReg_Idade/);
  await insFalha("faixa fora da lista é recusada", { FaixaSala: "ADULTOS" }, /CK_CheckinReg_Faixa/);
  await insFalha("a criança é membro OU visitante: os dois ao mesmo tempo, não", { MenorMembroId: 7021 }, /CK_CheckinReg_Crianca/);
  await insFalha("nem um nem outro, também não", { VisitanteNome: null, VisitanteNascimento: null }, /CK_CheckinReg_Crianca/);
  await insFalha("visitante sem data de nascimento é recusado", { VisitanteNascimento: null }, /CK_CheckinReg_Crianca/);
  await insFalha("sem quem trouxe é recusado", { TrouxeNome: null, TrouxeDocumento: null }, /CK_CheckinReg_Trouxe/);
  await insFalha("quem trouxe sem documento conferido é recusado", { TrouxeDocumento: null }, /CK_CheckinReg_Trouxe/);
  await insFalha("documento fora da lista é recusado", { TrouxeDocumento: "PASSAPORTE" }, /CK_CheckinReg_TrouxeDoc|truncat/i);
  await insFalha("saúde sem origem é recusada", { SaudeTexto: "alergia a amendoim" }, /CK_CheckinReg_Saude/);
  await insFalha("saúde do balcão sem versão e hash do texto é recusada", { SaudeTexto: "alergia a amendoim", SaudeOrigem: "BALCAO" }, /CK_CheckinReg_Saude/);
  await insFalha("origem da saúde fora da lista é recusada", { SaudeTexto: "alergia", SaudeOrigem: "OUTRA" }, /CK_CheckinReg_SaudeOrigem/);
  await insFalha("RETIRADA sem horário nem quem retirou é recusada", { Situacao: "RETIRADA" }, /CK_CheckinReg_Estado/);
  await insFalha("retirada pendente sem a marca de divergente é recusada", { Situacao: "RETIRADA_PENDENTE", RetiradoTipo: "OUTRO", DivergenciaPedidaEm: new Date() }, /CK_CheckinReg_Estado/);
  await insFalha("criança 'na sala' com dados de retirada é recusada", { RetiradoTipo: "RESPONSAVEL" }, /CK_CheckinReg_Estado/);
  await insFalha("situação fora da lista é recusada", { Situacao: "SUMIU" }, /CK_CheckinReg_Sit|CK_CheckinReg_Estado/);
  await insFalha("tipo de retirante fora da lista é recusado", { RetiradoTipo: "VIZINHO" }, /CK_CheckinReg_RetTipo|CK_CheckinReg_Estado/);
  await insFalha("tentativas negativas são recusadas", { Tentativas: -1 }, /CK_CheckinReg_Tentativas/);
  await insFalha("serviço que não existe é recusado (chave estrangeira)", { ServicoId: 999999 }, /FOREIGN KEY/);
  await insFalha("quem entregou que não existe é recusado (chave estrangeira)", { EntreguePorMembroId: 99999999 }, /FOREIGN KEY/);
  await insFalha("sem o HMAC do código é recusado", { CodigoHash: null }, /NULL/);

  const r1 = await ins({});
  ok((await escalar("SELECT Situacao FROM CheckinInfantilRegistros WHERE RegistroId = @r", { r: r1 })) === "NA_SALA", "o registro de visitante válido entra 'na sala'");
  const rm1 = await ins({ MenorMembroId: 7021, VisitanteNome: null, VisitanteNascimento: null });
  await insFalha("a criança membro já está numa sala: o índice único recusa a segunda", { MenorMembroId: 7021, VisitanteNome: null, VisitanteNascimento: null }, /UX_CheckinReg_MenorEmSala|duplicate/i);
  await ins({ MenorMembroId: 7022, VisitanteNome: null, VisitanteNascimento: null });
  await insFalha("a mesma criança em OUTRO serviço, com o primeiro ainda aberto: também recusada (a regra é uma sala por vez)", { MenorMembroId: 7021, VisitanteNome: null, VisitanteNascimento: null, ServicoId: sv2 }, /UX_CheckinReg_MenorEmSala|duplicate/i);
  await q("UPDATE CheckinInfantilRegistros SET Situacao = 'RETIRADA', RetiradoEm = SYSUTCDATETIME(), RetiradoTipo = 'RESPONSAVEL', RetiradoMembroId = 7020, RetiradoPorOperadorId = 6010 WHERE RegistroId = @r", { r: rm1 });
  const rm2 = await ins({ MenorMembroId: 7021, VisitanteNome: null, VisitanteNascimento: null, ServicoId: sv2 });
  ok(rm2 > rm1, "depois de retirada, a criança volta a ter um registro novo (outra visita)");
  await insFalha("e de novo duas ao mesmo tempo, não", { MenorMembroId: 7021, VisitanteNome: null, VisitanteNascimento: null }, /UX_CheckinReg_MenorEmSala|duplicate/i);
  await q("UPDATE CheckinInfantilRegistros SET Situacao = 'RETIRADA', RetiradoEm = SYSUTCDATETIME(), RetiradoTipo = 'RESPONSAVEL', RetiradoMembroId = 7020, RetiradoPorOperadorId = 6010 WHERE RegistroId = @r", { r: rm2 });

  console.log("== o registro é prova de custódia: o que o gatilho proíbe ==");
  await nega("o registro não se apaga", "DELETE FROM CheckinInfantilRegistros WHERE RegistroId = @r", { r: r1 }, /prova de custódia: não se apaga/);
  await nega("nem uma pessoa 'na sala' se apaga", "DELETE FROM CheckinInfantilRegistros WHERE Situacao = 'NA_SALA' AND RegistroId = @r", { r: r1 }, /não se apaga/);
  for (const [coluna, valor] of [["ServicoId", sv2], ["EquipeId", eq.bercario], ["CongregacaoId", c2], ["EntreguePorMembroId", 6011], ["IdadeAnos", 9], ["FaixaSala", "INFANTIL"]]) {
    await nega(`o ${coluna} do registro não se altera`, `UPDATE CheckinInfantilRegistros SET ${coluna} = @v WHERE RegistroId = @r`, { v: valor, r: r1 }, /não se altera/);
  }
  await nega("o horário em que a criança foi entregue não se altera", "UPDATE CheckinInfantilRegistros SET EntregueEm = DATEADD(HOUR, 1, EntregueEm) WHERE RegistroId = @r", { r: r1 }, /não se altera/);
  await nega("a criança membro do registro não se troca", "UPDATE CheckinInfantilRegistros SET MenorMembroId = 7022 WHERE RegistroId = @rm", { rm: rm2 }, /não se altera/);
  await aceita("mas as tentativas, a trava e o HMAC do código mudam (é assim que a retirada e a segunda via funcionam)", "UPDATE CheckinInfantilRegistros SET Tentativas = 2, Travado = 1, CodigoHash = REPLICATE('b', 64), CodigoGeracao = 2 WHERE RegistroId = @r", { r: r1 });
  await aceita("e o dado de saúde pode ser apagado (revogação do consentimento)", "UPDATE CheckinInfantilRegistros SET SaudeTexto = NULL, SaudeOrigem = NULL, SaudeTextoVersao = NULL, SaudeTextoHash = NULL WHERE RegistroId = @r", { r: r1 });
  await aceita("a criança 'na sala' passa a retirada pelo banco com todos os campos (o que o servidor faz)", "UPDATE CheckinInfantilRegistros SET Situacao = 'RETIRADA', RetiradoEm = SYSUTCDATETIME(), RetiradoTipo = 'OUTRO', RetiradoNome = N'Fulano Retirante', RetiradoPorOperadorId = 6010 WHERE RegistroId = @r", { r: r1 });
  await nega("retirada não volta para 'na sala'", "UPDATE CheckinInfantilRegistros SET Situacao = 'NA_SALA', RetiradoEm = NULL, RetiradoTipo = NULL, RetiradoNome = NULL, RetiradoPorOperadorId = NULL WHERE RegistroId = @r", { r: r1 }, /não se altera/);
  await nega("o horário da retirada não se altera", "UPDATE CheckinInfantilRegistros SET RetiradoEm = DATEADD(HOUR, -2, RetiradoEm) WHERE RegistroId = @r", { r: r1 }, /não se altera/);
  await nega("o tipo de quem retirou não se altera", "UPDATE CheckinInfantilRegistros SET RetiradoTipo = 'RESPONSAVEL' WHERE RegistroId = @r", { r: r1 }, /não se altera/);
  await nega("o voluntário que entregou a criança não se troca (RetiradoPorOperadorId)", "UPDATE CheckinInfantilRegistros SET RetiradoPorOperadorId = 6011 WHERE RegistroId = @r", { r: r1 }, /não se altera/);
  await nega("a matrícula de quem retirou não se troca", "UPDATE CheckinInfantilRegistros SET RetiradoMembroId = 7020 WHERE RegistroId = @r", { r: r1 }, /não se altera/);
  await nega("a retirada não deixa de ser divergente (nem passa a ser)", "UPDATE CheckinInfantilRegistros SET Divergente = 1, DivergenciaPedidaEm = SYSUTCDATETIME(), DivergenciaDecididaPorId = 6011, DivergenciaDecididaEm = SYSUTCDATETIME() WHERE RegistroId = @r", { r: r1 }, /não se altera/);
  await nega("o NOME de quem retirou (texto livre) não se reescreve antes da anonimização", "UPDATE CheckinInfantilRegistros SET RetiradoNome = N'Outra Pessoa Inventada' WHERE RegistroId = @r", { r: r1 }, /não se altera/);
  await nega("o NOME de quem trouxe a criança não se reescreve antes da anonimização", "UPDATE CheckinInfantilRegistros SET TrouxeNome = N'Outra Pessoa Inventada' WHERE RegistroId = @r", { r: r1 }, /não se altera/);
  await nega("o documento conferido de quem trouxe não se reescreve", "UPDATE CheckinInfantilRegistros SET TrouxeDocumento = 'CNH' WHERE RegistroId = @r", { r: r1 }, /não se altera/);
  await nega("a matrícula de quem trouxe não se troca", "UPDATE CheckinInfantilRegistros SET TrouxeMembroId = 7020 WHERE RegistroId = @r", { r: r1 }, /não se altera/);
  await aceita("a anonimização (a única reescrita admitida dos campos pessoais) passa", "UPDATE CheckinInfantilRegistros SET VisitanteNome = N'(anonimizado)', VisitanteNascimento = NULL, TrouxeNome = NULL, TrouxeContato = NULL, RetiradoNome = NULL, AnonimizadoEm = SYSUTCDATETIME() WHERE RegistroId = @r", { r: r1 });
  await nega("depois de anonimizado, não se desfaz (o CHECK e o gatilho seguram)", "UPDATE CheckinInfantilRegistros SET AnonimizadoEm = NULL WHERE RegistroId = @r", { r: r1 }, /não se altera|CK_CheckinReg_Crianca/);
  await nega("nem se troca a data da anonimização", "UPDATE CheckinInfantilRegistros SET AnonimizadoEm = DATEADD(DAY, 1, AnonimizadoEm) WHERE RegistroId = @r", { r: r1 }, /não se altera/);

  console.log("== o histórico de acréscimo ==");
  await aceita("um evento entra", "INSERT INTO CheckinInfantilEventos (RegistroId, ServicoId, EquipeId, Tipo, AtorMembroId, Detalhe) VALUES (@r, @s, @e, 'CHECKIN', 6010, N'adultos=2;criancas=1')", { r: r1, s: sv, e: eq.maternal });
  await aceita("evento sem registro (voluntário entrou na sala) também entra", "INSERT INTO CheckinInfantilEventos (RegistroId, ServicoId, EquipeId, Tipo, AtorMembroId) VALUES (NULL, @s, @e, 'VOLUNTARIO_ENTROU', 6010)", { s: sv, e: eq.maternal });
  await nega("tipo de evento fora da lista é recusado", "INSERT INTO CheckinInfantilEventos (ServicoId, EquipeId, Tipo, AtorMembroId) VALUES (@s, @e, 'INVENTADO', 6010)", { s: sv, e: eq.maternal }, /CK_CheckinEv_Tipo/);
  await nega("evento de registro que não existe é recusado", "INSERT INTO CheckinInfantilEventos (RegistroId, ServicoId, EquipeId, Tipo, AtorMembroId) VALUES (999999, @s, @e, 'CHECKIN', 6010)", { s: sv, e: eq.maternal }, /FOREIGN KEY/);
  await nega("evento sem quem agiu é recusado", "INSERT INTO CheckinInfantilEventos (ServicoId, EquipeId, Tipo) VALUES (@s, @e, 'CHECKIN')", { s: sv, e: eq.maternal }, /NULL/);
  await nega("o histórico não se altera", "UPDATE CheckinInfantilEventos SET Tipo = 'RETIRADA' WHERE RegistroId = @r", { r: r1 }, /não se altera nem se apaga/);
  await nega("nem o detalhe", "UPDATE CheckinInfantilEventos SET Detalhe = N'outro' WHERE ServicoId = @s", { s: sv }, /não se altera nem se apaga/);
  await nega("o histórico não se apaga", "DELETE FROM CheckinInfantilEventos WHERE RegistroId = @r", { r: r1 }, /não se altera nem se apaga/);
  await nega("nem o evento sem registro", "DELETE FROM CheckinInfantilEventos WHERE RegistroId IS NULL AND ServicoId = @s", { s: sv }, /não se altera nem se apaga/);
  await aceita("UPDATE que não alcança nenhum evento não é erro", "UPDATE CheckinInfantilEventos SET Detalhe = N'x' WHERE EventoId = -1", {});

  console.log("== a presença dos voluntários ==");
  await aceita("o voluntário entra na sala", "INSERT INTO CheckinInfantilVoluntarios (ServicoId, EquipeId, MembroId) VALUES (@s, @e, 6010)", { s: sv, e: eq.maternal });
  await nega("e não entra duas vezes sem ter saído (índice único)", "INSERT INTO CheckinInfantilVoluntarios (ServicoId, EquipeId, MembroId) VALUES (@s, @e, 6010)", { s: sv, e: eq.maternal }, /UX_CheckinVol_Presente|duplicate/i);
  await nega("saída antes da entrada é recusada", "UPDATE CheckinInfantilVoluntarios SET SaiuEm = DATEADD(HOUR, -1, EntrouEm) WHERE MembroId = 6010 AND ServicoId = @s", { s: sv }, /CK_CheckinVol_Saida/);
  await aceita("sai da sala", "UPDATE CheckinInfantilVoluntarios SET SaiuEm = SYSUTCDATETIME() WHERE MembroId = 6010 AND ServicoId = @s", { s: sv });
  await aceita("e pode entrar de novo depois de sair (a presença é por intervalo)", "INSERT INTO CheckinInfantilVoluntarios (ServicoId, EquipeId, MembroId) VALUES (@s, @e, 6010)", { s: sv, e: eq.maternal });
  await nega("o mesmo voluntário não está em DUAS salas do mesmo serviço ao mesmo tempo (uma pessoa só está num lugar: o adulto da proporção é o que está lá)", "INSERT INTO CheckinInfantilVoluntarios (ServicoId, EquipeId, MembroId) VALUES (@s, @e, 6010)", { s: sv, e: eq.bercario }, /UX_CheckinVol_UmaSala|duplicate/i);
  await aceita("em OUTRO serviço, sim (cada culto tem a sua presença)", "INSERT INTO CheckinInfantilVoluntarios (ServicoId, EquipeId, MembroId) VALUES (@s, @e, 6010)", { s: sv2, e: eq.bercario });

  console.log("== a lista de autorizados a retirar ==");
  const aut = (over = {}) => montar({ MenorMembroId: 7021, AutorizadoMembroId: null, Nome: "Vovó Autorizada", Parentesco: "AVO", Forma: "RESPONSAVEL", RegistradoPorMembroId: 7020, ...over }, "CheckinInfantilAutorizados", { MenorMembroId: 7021, AutorizadoMembroId: null, Nome: "Vovó Autorizada", Parentesco: "AVO", Forma: "RESPONSAVEL", RegistradoPorMembroId: 7020 });
  const autFalha = async (descricao, over, padrao) => { const m = aut(over); const msg = await falha(m.texto, m.params); ok(msg && padrao.test(msg), descricao, msg); };
  await autFalha("forma fora da lista é recusada", { Forma: "VERBAL" }, /CK_CheckinAut_Forma/);
  await autFalha("a ficha física exige a referência de onde está arquivada", { Forma: "FICHA_FISICA" }, /CK_CheckinAut_Ficha/);
  await autFalha("revogação sem quem revogou é recusada", { RevogadoEm: new Date() }, /CK_CheckinAut_Revogacao/);
  await autFalha("a criança não autoriza a si mesma", { AutorizadoMembroId: 7021 }, /CK_CheckinAut_NaoSiMesmo/);
  const a1 = (await q(aut({ AutorizadoMembroId: 7020 }).texto, aut({ AutorizadoMembroId: 7020 }).params))[0].id;
  await autFalha("o mesmo adulto duas vezes para a mesma criança (índice único)", { AutorizadoMembroId: 7020 }, /UX_CheckinAut_MembroAtivo|duplicate/i);
  await aceita("já duas pessoas SEM matrícula (só nome) são aceitas: o índice só vale para membro", aut({ Nome: "Tio Um" }).texto, aut({ Nome: "Tio Um" }).params);
  await nega("a autorização não se apaga: revoga-se", "DELETE FROM CheckinInfantilAutorizados WHERE AutorizadoId = @a", { a: a1 }, /revoga-se, não se apaga/);
  await aceita("revogar é preencher quem e quando", "UPDATE CheckinInfantilAutorizados SET RevogadoEm = SYSUTCDATETIME(), RevogadoPorMembroId = 7020 WHERE AutorizadoId = @a", { a: a1 });
  await aceita("depois de revogada, o mesmo adulto pode ser autorizado de novo (outra linha)", aut({ AutorizadoMembroId: 7020 }).texto, aut({ AutorizadoMembroId: 7020 }).params);
  await aceita("os autorizados só desta visita entram", "INSERT INTO CheckinInfantilAutorizadosVisita (RegistroId, Nome, Parentesco) VALUES (@r, N'Tia da Visita', 'TIO')", { r: r1 });
  await nega("autorizado de visita de registro que não existe é recusado", "INSERT INTO CheckinInfantilAutorizadosVisita (RegistroId, Nome, Parentesco) VALUES (999999, N'x', 'TIO')", {}, /FOREIGN KEY/);

  console.log("== a saúde da criança membro ==");
  const sd = (over = {}) => montar({ MenorMembroId: 7022, Texto: "Alergia a amendoim", Forma: "RESPONSAVEL", RegistradoPorMembroId: 7020, ...over }, "CheckinInfantilSaude", { MenorMembroId: 7022, Texto: "Alergia a amendoim", Forma: "RESPONSAVEL", RegistradoPorMembroId: 7020 });
  const sdFalha = async (descricao, over, padrao) => { const m = sd(over); const msg = await falha(m.texto.replace("; SELECT CAST(SCOPE_IDENTITY() AS INT) AS id", ""), m.params); ok(msg && padrao.test(msg), descricao, msg); };
  await sdFalha("forma fora da lista é recusada", { Forma: "VERBAL" }, /CK_CheckinSaude_Forma/);
  await sdFalha("ficha física sem referência é recusada", { Forma: "FICHA_FISICA" }, /CK_CheckinSaude_Ficha/);
  await sdFalha("texto de um caractere é recusado", { Texto: "a" }, /CK_CheckinSaude_Texto/);
  await sdFalha("texto só de espaços é recusado", { Texto: "    " }, /CK_CheckinSaude_Texto/);
  await sdFalha("saúde de criança que não existe é recusada", { MenorMembroId: 99999999 }, /FOREIGN KEY/);
  await aceita("a saúde válida entra", sd().texto.replace("; SELECT CAST(SCOPE_IDENTITY() AS INT) AS id", ""), sd().params);
  await sdFalha("uma linha só por criança (chave primária)", {}, /PRIMARY KEY|duplicate/i);

  console.log("== a segunda via (dois olhares) ==");
  const via = (over = {}) => { const d = { RegistroId: rm2, PedidaPorMembroId: 6010, PessoaTipo: "RESPONSAVEL", PessoaNome: "Mãe Teste", Documento: "RG" }; const todos = { ...d, ...over }; const cols = Object.keys(todos); const params = {}; cols.forEach((k, i) => { params["p" + i] = todos[k]; });
    return { texto: `INSERT INTO CheckinInfantilSegundasVias (${cols.join(", ")}) VALUES (${cols.map((_, i) => "@p" + i).join(", ")}); SELECT CAST(SCOPE_IDENTITY() AS INT) AS id`, params }; };
  const viaFalha = async (descricao, over, padrao) => { const m = via(over); const msg = await falha(m.texto, m.params); ok(msg && padrao.test(msg), descricao, msg); };
  await viaFalha("tipo de pessoa fora da lista é recusado", { PessoaTipo: "VIZINHO" }, /CK_CheckinVia_Tipo/);
  await viaFalha("documento fora da lista é recusado", { Documento: "PASSAPORTE" }, /CK_CheckinVia_Doc|truncat/i);
  await viaFalha("confirmar a própria segunda via é recusado (dois olhares)", { ConfirmadaPorMembroId: 6010, ConfirmadaEm: new Date() }, /CK_CheckinVia_Dois/);
  await viaFalha("confirmação sem horário é recusada", { ConfirmadaPorMembroId: 6011 }, /CK_CheckinVia_Conf/);
  await viaFalha("horário de confirmação sem quem confirmou é recusado", { ConfirmadaEm: new Date() }, /CK_CheckinVia_Conf/);
  await viaFalha("pedido cancelado e confirmado ao mesmo tempo é recusado", { ConfirmadaPorMembroId: 6011, ConfirmadaEm: new Date(), CanceladaEm: new Date() }, /CK_CheckinVia_Cancel/);
  const v1 = (await q(via().texto, via().params))[0].id;
  await viaFalha("um pedido aguardando por registro (índice único)", {}, /UX_CheckinVia_Pendente|duplicate/i);
  await nega("o pedido de segunda via não se apaga", "DELETE FROM CheckinInfantilSegundasVias WHERE ViaId = @v", { v: v1 }, /não se apaga/);
  await aceita("confirmado por OUTRO adulto passa", "UPDATE CheckinInfantilSegundasVias SET ConfirmadaPorMembroId = 6011, ConfirmadaEm = SYSUTCDATETIME() WHERE ViaId = @v", { v: v1 });
  await aceita("depois de confirmado, um novo pedido para o mesmo registro entra", via().texto, via().params);

  console.log("== idempotência: reaplicar a 145 duas vezes, com dados e ajustes da Igreja no banco ==");
  const antes = {
    objetos: await escalar("SELECT COUNT(*) FROM sys.objects WHERE name LIKE '%Checkin%' OR name LIKE '%CheckinReg%'"),
    indices: await escalar("SELECT COUNT(*) FROM sys.indexes WHERE name LIKE '%Checkin%' OR name = 'CK_x'"),
    checks: await escalar("SELECT COUNT(*) FROM sys.check_constraints WHERE name LIKE 'CK[_]Checkin%' OR name = 'CK_MenoresRetiradas_Origem'"),
    gatilhos: await escalar("SELECT COUNT(*) FROM sys.triggers WHERE name LIKE 'TR[_]Checkin%'"),
    registros: await escalar("SELECT COUNT(*) FROM CheckinInfantilRegistros"), eventos: await escalar("SELECT COUNT(*) FROM CheckinInfantilEventos")
  };
  await q("UPDATE Prazos SET Dias = 3 WHERE Sigla = 'CHECKIN_TENTATIVAS_CODIGO'");
  await q("UPDATE PoliticasRetencao SET DiasRetencao = 2000 WHERE Categoria = N'Check-in infantil (entrega e retirada de crianças)'");
  await q("UPDATE NotificacaoRegras SET Ativa = 0 WHERE Chave = 'CHECKIN_SEM_RETIRADA'");
  const sqlTexto = fs.readFileSync(path.join(API, "../sql/migrations/145_checkin_infantil.sql"), "utf8");
  for (let i = 0; i < 2; i++) for (const lote of sqlTexto.split(/^\s*GO\s*$/gim).map((t) => t.trim()).filter(Boolean)) await pool.request().query(lote);
  const depois = {
    objetos: await escalar("SELECT COUNT(*) FROM sys.objects WHERE name LIKE '%Checkin%' OR name LIKE '%CheckinReg%'"),
    indices: await escalar("SELECT COUNT(*) FROM sys.indexes WHERE name LIKE '%Checkin%' OR name = 'CK_x'"),
    checks: await escalar("SELECT COUNT(*) FROM sys.check_constraints WHERE name LIKE 'CK[_]Checkin%' OR name = 'CK_MenoresRetiradas_Origem'"),
    gatilhos: await escalar("SELECT COUNT(*) FROM sys.triggers WHERE name LIKE 'TR[_]Checkin%'"),
    registros: await escalar("SELECT COUNT(*) FROM CheckinInfantilRegistros"), eventos: await escalar("SELECT COUNT(*) FROM CheckinInfantilEventos")
  };
  ok(JSON.stringify(antes) === JSON.stringify(depois), "reaplicar duas vezes não cria objeto nenhum (tabelas, índices, CHECK, gatilhos) nem mexe nos dados", { antes, depois });
  ok((await escalar("SELECT COUNT(*) FROM Prazos WHERE Sigla LIKE 'CHECKIN[_]%'")) === 4, "nem duplica os prazos");
  ok((await escalar("SELECT Dias FROM Prazos WHERE Sigla = 'CHECKIN_TENTATIVAS_CODIGO'")) === 3, "nem desfaz o ajuste que a Igreja fez num prazo");
  ok((await escalar("SELECT COUNT(*) FROM NotificacaoRegras WHERE Chave IN ('CHECKIN_RETIRADA_DIVERGENTE', 'CHECKIN_SEGUNDA_VIA', 'CHECKIN_SEM_RETIRADA', 'EBD_PROFESSOR_RETIRADO')")) === 4, "nem as 4 regras de aviso");
  ok((await escalar("SELECT Ativa FROM NotificacaoRegras WHERE Chave = 'CHECKIN_SEM_RETIRADA'")) === false, "nem religa uma regra que a gestão desativou");
  ok((await escalar("SELECT COUNT(*) FROM PoliticasRetencao WHERE Categoria = N'Check-in infantil (entrega e retirada de crianças)'")) === 1 && (await escalar("SELECT DiasRetencao FROM PoliticasRetencao WHERE Categoria = N'Check-in infantil (entrega e retirada de crianças)'")) === 2000, "nem duplica a política de retenção nem desfaz o prazo ajustado");
  ok((await escalar("SELECT COUNT(*) FROM sys.triggers WHERE name LIKE 'TR[_]Checkin%' AND is_disabled = 1")) === 0, "os 4 gatilhos continuam ligados");
  const rSolto = await ins({ VisitanteNome: "Visitante sem dependentes" });
  await nega("e o gatilho refeito continua valendo (apagar um registro sem nada ligado a ele)", "DELETE FROM CheckinInfantilRegistros WHERE RegistroId = @r", { r: rSolto }, /não se apaga/);
  await nega("e a regra nova do CHECK da saúde também (texto sem origem)", montar({ SaudeTexto: "alergia" }).texto, montar({ SaudeTexto: "alergia" }).params, /CK_CheckinReg_Saude/);
  await q("UPDATE Prazos SET Dias = 5 WHERE Sigla = 'CHECKIN_TENTATIVAS_CODIGO'");
  await q("UPDATE PoliticasRetencao SET DiasRetencao = 1825 WHERE Categoria = N'Check-in infantil (entrega e retirada de crianças)'");
  await q("UPDATE NotificacaoRegras SET Ativa = 1 WHERE Chave = 'CHECKIN_SEM_RETIRADA'");

  console.log("== limpeza dos registros de teste (gatilhos desligados só aqui) ==");
  for (const [tabela, gatilho] of [["CheckinInfantilEventos", "TR_CheckinEventos_Imutavel"], ["CheckinInfantilSegundasVias", "TR_CheckinVias_SemApagar"], ["CheckinInfantilRegistros", "TR_CheckinRegistros_Protegido"], ["CheckinInfantilAutorizados", "TR_CheckinAutorizados_SemApagar"]]) {
    const apaga = tabela === "CheckinInfantilRegistros" ? "DELETE FROM dbo.CheckinInfantilAutorizadosVisita; DELETE FROM dbo.CheckinInfantilRegistros" : `DELETE FROM dbo.${tabela}`;
    await q(`DISABLE TRIGGER dbo.${gatilho} ON dbo.${tabela}; ${apaga}; ENABLE TRIGGER dbo.${gatilho} ON dbo.${tabela}`);
  }
  await q("DELETE FROM dbo.CheckinInfantilVoluntarios; DELETE FROM dbo.CheckinInfantilSaude");
  await q("DISABLE TRIGGER dbo.TR_MenoresRetiradas_Imutavel ON dbo.MinisterioMenoresRetiradas; DELETE FROM dbo.MinisterioMenoresRetiradas WHERE Motivos = N'TESTE145'; ENABLE TRIGGER dbo.TR_MenoresRetiradas_Imutavel ON dbo.MinisterioMenoresRetiradas");
  await q("DELETE FROM EbdTurmas WHERE TurmaId = @t", { t: turma });
  await q("DELETE FROM EscalasServicos WHERE ServicoId IN (@a, @b)", { a: sv, b: sv2 });
  await q("DELETE FROM MembroReferencia WHERE MembroId IN (7020, 7021, 7022)");
  let sobras = 0; for (const t of H.TABELAS_CK) sobras += await escalar(`SELECT COUNT(*) FROM ${t}`);
  ok(sobras === 0 && (await escalar("SELECT COUNT(*) FROM sys.triggers WHERE (name LIKE 'TR[_]Checkin%' OR name = 'TR_MenoresRetiradas_Imutavel') AND is_disabled = 1")) === 0 && (await escalar("SELECT COUNT(*) FROM MinisterioMenoresRetiradas WHERE Motivos = N'TESTE145'")) === 0,
    "base limpa e todos os gatilhos de volta ligados", sobras);

  console.log("== o cenário: pré-condições da v7.7 e a Secretaria de cada congregação ==");
  for (const [id, quem] of [[6001, "líder Maria"], [6002, "líder Jorge"], [6010, "Ana"], [6011, "Bruno"], [6012, "Carla"], [6024, "Olga"], [6003, "líder Rita (Vila)"], [6023, "Nilo (Vila)"], [6026, "Quitéria (Vila)"]]) {
    const ap = await require(path.join(API, "shared/ministerioMenoresDb.js")).aptidaoDe(pool, id);
    ok(ap && ap.apto === true && ap.contaComoAdulto === true, `${quem} (${id}) é adulto APTO hoje (pré-condição dos roteiros)`, ap && ap.bloqueios.map((b) => b.codigo));
  }
  const papelSec = await escalar("SELECT PapelId FROM Papeis WHERE Nome = N'Secretaria de Congregação E2E'") || (await q("INSERT INTO Papeis (Nome, Nivel, Permissoes) VALUES (N'Secretaria de Congregação E2E', 'CONGREGACAO', N'habilitacao_voluntarios,pessoas'); SELECT CAST(SCOPE_IDENTITY() AS INT) AS id"))[0].id;
  await H.adulto(7010, "Secretaria Central E2E", c1); await H.adulto(7011, "Secretaria Vila E2E", c2);
  for (const [id, cong] of [[7010, c1], [7011, c2]]) if (!(await escalar("SELECT COUNT(*) FROM Lideranca WHERE MembroId = @m AND PapelId = @p", { m: id, p: papelSec }))) await q("INSERT INTO Lideranca (MembroId, PapelId, EscopoTipo, EscopoId) VALUES (@m, @p, 'CONGREGACAO', @c)", { m: id, p: papelSec, c: cong });
  const psc = require(path.join(API, "shared/psc.js"));
  const gestaoCentral = (await psc.resolverDestinatariosDaCongregacao(pool, { permissao: "habilitacao_voluntarios", congregacaoId: c1 })).map((d) => Number(d.membroId)).sort((a, b) => a - b);
  const gestaoVila = (await psc.resolverDestinatariosDaCongregacao(pool, { permissao: "habilitacao_voluntarios", congregacaoId: c2 })).map((d) => Number(d.membroId)).sort((a, b) => a - b);
  ok(gestaoCentral.includes(7010) && !gestaoCentral.includes(7011) && gestaoVila.includes(7011) && !gestaoVila.includes(7010), "a Secretaria de cada congregação recebe só os avisos da própria congregação", { gestaoCentral, gestaoVila });
  ok(gestaoCentral.includes(1001) && gestaoCentral.includes(1002) && gestaoVila.includes(1001), "e a Diretoria (nível geral) recebe os de todas", { gestaoCentral, gestaoVila });
  const cenario = { c1, c2, c3, eq, secretaria: { central: 7010, vila: 7011 }, gestaoCentral, gestaoVila, voluntariosCentral: [6010, 6011, 6012, 6024], lideres: { central: 6001, centralDois: 6002, vila: 6003 }, voluntariosVila: [6023, 6026],
    faixas: { bercario: 3, maternal: 5, infantilVila: 8 }, faixaDaEquipe: { bercario: "BERCARIO", maternal: "MATERNAL", infantilVila: "INFANTIL" } };
  fs.writeFileSync(path.join(__dirname, "cenario-checkin.json"), JSON.stringify(cenario, null, 1));
  const menoresJson = path.join(__dirname, "cenario-menores.json");
  if (!fs.existsSync(menoresJson)) fs.writeFileSync(menoresJson, JSON.stringify({ eq: { bercario: eq.bercario, maternal: eq.maternal, recepcao: eq.recepcao, infantilVila: eq.infantilVila, novaSemMarca: await eqId("Equipe Futura M7") }, c1, c2 }, null, 1));
  console.log("cenário da v7.10 gravado:", JSON.stringify({ c1, c2, eq }));
  fim("e2e-18-checkin-setup");
})().catch((e) => { erroFatal("ERRO:", e); process.exitCode = 1; try { L.shimEncerrar(); } catch { } });
