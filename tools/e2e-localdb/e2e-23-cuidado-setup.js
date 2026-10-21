// e2e-23-cuidado-setup.js — v7.11 (Cuidado pastoral): as garantias da migração 148 (esquema, CHECK, gatilhos, índices únicos, a marca de purga das notas, permissão, papel,
// prazos, avisos, retenção) e o cenário dos roteiros e2e-24 a e2e-26, sobre a base "pastoral-148" (a da v7.8 com as migrações 145 a 148).
// Os registros de teste dos gatilhos são APAGADOS no fim (com os gatilhos desligados só durante a limpeza), para a base salva sair limpa.
const L = require("./lib");
const { ok, fim, q, um, escalar, obterPool, hojeBr } = L;

async function falha(texto, params) { try { await q(texto, params); return null; } catch (e) { return String(e && e.message); } }
const nega = async (descricao, texto, params, padrao) => { const m = await falha(texto, params); ok(m && padrao.test(m), descricao, m); };
const aceita = async (descricao, texto, params) => { const m = await falha(texto, params); ok(m === null, descricao, m); };
const somarDias = (iso, d) => { const [a, m, x] = iso.split("-").map(Number); return new Date(Date.UTC(a, m - 1, x + d)).toISOString().slice(0, 10); };

// Pessoas do cenário (MembroReferencia.MembroId não é IDENTITY)
const P = {
  superintendente: 8001,
  ana: 8010, bento: 8011, carla: 8012, davi: 8013, elisa: 8014, fabio: 8015, gabi: 8016, hugo: 8017, iris: 8018, joao: 8019, menor: 8021,
  vilaA: 8030, vilaB: 8031, beta: 8040, saiu: 8050
};

(async () => {
  await obterPool();
  const c1 = await escalar("SELECT CongregacaoId FROM Congregacoes WHERE Nome = N'Central E2E'");
  const c2 = await escalar("SELECT CongregacaoId FROM Congregacoes WHERE Nome = N'Vila Nova E2E'");
  const c3 = await escalar("SELECT CongregacaoId FROM Congregacoes WHERE Nome = N'Beta E2E'");
  ok(!!c1 && !!c2 && !!c3, "o cenário-base existe (3 congregações)", { c1, c2, c3 });

  console.log("== migração 148: esquema ==");
  const TABELAS = ["PedidosOracao", "CuidadoItens", "CuidadoEventos", "NotasPastorais", "NotasPastoraisLeituras"];
  for (const t of TABELAS) ok((await escalar("SELECT COUNT(*) FROM sys.tables WHERE name = @t", { t })) === 1, `tabela ${t} existe`);
  for (const g of ["TR_PedidosOracao_Protegido", "TR_CuidadoItens_Protegido", "TR_CuidadoEventos_Imutavel", "TR_NotasPastorais_Imutavel", "TR_NotasPastoraisLeituras_Imutavel"]) {
    ok((await escalar("SELECT COUNT(*) FROM sys.triggers WHERE name = @t AND is_disabled = 0", { t: g })) === 1, `gatilho ${g} existe e está ligado`);
  }
  for (const ix of ["UX_CuidadoItens_UmAbertoPorPessoa", "UX_CuidadoItens_UmPorPedido"]) {
    ok((await escalar("SELECT COUNT(*) FROM sys.indexes WHERE name = @i AND is_unique = 1 AND has_filter = 1", { i: ix })) === 1, `índice único filtrado ${ix} existe`);
  }
  const CHECKS = ["CK_PedidosOracao_ParaQuem", "CK_PedidosOracao_Categoria", "CK_PedidosOracao_Moderacao", "CK_PedidosOracao_RiscoOrigem", "CK_PedidosOracao_Texto", "CK_PedidosOracao_Quem",
    "CK_PedidosOracao_Registrante", "CK_PedidosOracao_Anonimizado", "CK_PedidosOracao_Aprovado", "CK_PedidosOracao_RiscoMarca", "CK_CuidadoItens_Tipo", "CK_CuidadoItens_Origem", "CK_CuidadoItens_Nivel",
    "CK_CuidadoItens_Status", "CK_CuidadoItens_Desfecho", "CK_CuidadoItens_Pessoa", "CK_CuidadoItens_Encerramento", "CK_CuidadoItens_Anonimizado", "CK_CuidadoItens_Contadores",
    "CK_CuidadoEventos_Tipo", "CK_CuidadoEventos_Forma", "CK_CuidadoEventos_Contato", "CK_CuidadoEventos_Visita", "CK_NotasPastorais_Nivel", "CK_NotasPastorais_Alvo"];
  for (const c of CHECKS) ok((await escalar("SELECT COUNT(*) FROM sys.check_constraints WHERE name = @c AND is_disabled = 0 AND is_not_trusted = 0", { c })) === 1, `CHECK ${c} existe, ligado e confiável`);

  console.log("== migração 148: permissão, papel, prazos, avisos, retenção ==");
  ok((await escalar("SELECT COUNT(*) FROM Funcionalidades WHERE Chave = 'cuidado_pastoral' AND LEN(Nome) <= 100")) === 1, "a permissão cuidado_pastoral existe (nome cabe em 100)");
  const comPerm = (await q("SELECT Nome FROM Papeis WHERE (',' + Permissoes + ',') LIKE '%,cuidado_pastoral,%' ORDER BY Nome")).map((p) => p.Nome);
  ok(["Dirigente de Congregação", "Pastor de Área", "Presidente", "Secretário Geral", "Superintendente Regional"].every((n) => comPerm.includes(n)) && comPerm.length === 5, "só os 5 papéis do cuidado têm a permissão", comPerm);
  ok((await escalar("SELECT COUNT(*) FROM Papeis WHERE Nome = N'Superintendente Regional' AND Nivel = 'REGIAO'")) === 1, "o papel Superintendente Regional existe no nível Região");
  ok((await escalar("SELECT COUNT(*) FROM Papeis WHERE Nome = N'Dirigente de Congregação' AND (',' + Permissoes + ',') LIKE '%,cuidado_pastoral,%cuidado_pastoral,%'")) === 0, "reaplicar não duplicou a permissão no papel");
  const prazos = Object.fromEntries((await q("SELECT Sigla, Dias FROM Prazos WHERE Sigla LIKE 'CUIDADO[_]%'")).map((p) => [p.Sigla, p.Dias]));
  const esperados = { CUIDADO_PRAZO_VISITANTE_HORAS: 48, CUIDADO_PRAZO_NOVO_CONVERTIDO_DIAS: 7, CUIDADO_PRAZO_AFASTAMENTO_DIAS: 14, CUIDADO_PRAZO_PEDIDO_VISITA_DIAS: 7, CUIDADO_PRAZO_PEDIDO_ORACAO_DIAS: 3,
    CUIDADO_PRAZO_POS_INTERNACAO_DIAS: 3, CUIDADO_PRAZO_DEGRAU_DIAS: 3, CUIDADO_DETECCAO_SEMANAS: 6, CUIDADO_DETECCAO_COSTUME_PCT: 50, CUIDADO_DETECCAO_QUEDA_PCT: 60 };
  ok(JSON.stringify(prazos, Object.keys(esperados).sort()) === JSON.stringify(esperados, Object.keys(esperados).sort()) && Object.keys(prazos).length === 10, "os 10 prazos nascem com os valores do contrato (48 h do visitante)", prazos);
  ok((await escalar("SELECT COUNT(*) FROM (SELECT Sigla FROM Prazos WHERE Sigla LIKE 'CUIDADO[_]%' GROUP BY Sigla HAVING COUNT(*) > 1) x")) === 0, "reaplicar não duplicou prazos");
  const regras = await q("SELECT Chave, Obrigatoria, CanalEmail, CanalPush, Categoria, Ativa FROM NotificacaoRegras WHERE Chave LIKE 'CUIDADO[_]%' ORDER BY Chave");
  ok(regras.length === 5 && regras.every((r) => r.Categoria === "CUIDADO" && r.Ativa && r.CanalEmail), "as 5 regras de aviso do cuidado existem, ativas, por e-mail", regras.map((r) => r.Chave));
  const risco = regras.find((r) => r.Chave === "CUIDADO_RISCO") || {};
  ok(risco.Obrigatoria === true && risco.CanalPush === true, "o aviso de SINAL DE RISCO é obrigatório e vai também pelo celular", risco);
  ok(regras.filter((r) => r.Obrigatoria).length === 1, "só o de risco é obrigatório (os outros a pessoa ajusta)");
  const pol = await q("SELECT Categoria, DiasRetencao, BaseLegal FROM PoliticasRetencao WHERE Categoria LIKE N'Cuidado pastoral%'");
  const dias = Object.fromEntries(pol.map((p) => [p.Categoria, p.DiasRetencao]));
  ok(pol.length === 4 && dias["Cuidado pastoral — acompanhamentos"] === 1825 && dias["Cuidado pastoral — pedidos de oração"] === 365 && dias["Cuidado pastoral — pedidos de oração com sinal de risco"] === 1825
    && dias["Cuidado pastoral — notas pastorais após a saída"] === 30, "as 4 políticas de retenção (5 anos, 1 ano, 5 anos, 30 dias)", dias);
  ok(pol.every((p) => p.BaseLegal !== "x" && p.BaseLegal.length <= 300), "a base legal de cada uma foi escrita (não o texto provisório) e cabe em 300", pol.map((p) => p.BaseLegal.length));

  console.log("== cenário: a Região com Superintendente, os cargos e as pessoas acompanhadas ==");
  let regiao = await escalar("SELECT RegiaoId FROM Regioes WHERE Nome = N'Região Norte E2E'");
  if (!regiao) regiao = (await q("INSERT INTO Regioes (Nome) VALUES (N'Região Norte E2E'); SELECT CAST(SCOPE_IDENTITY() AS INT) AS id"))[0].id;
  await q("UPDATE Areas SET RegiaoId = @r WHERE AreaId = (SELECT AreaId FROM Congregacoes WHERE CongregacaoId = @c)", { r: regiao, c: c1 });
  const membro = (id, nome, cong, nasc = "1985-05-05", extra = {}) => q(`IF NOT EXISTS (SELECT 1 FROM MembroReferencia WHERE MembroId = @id)
    INSERT INTO MembroReferencia (MembroId, Nome, CongregacaoId, Status, DataNascimento, Telefone, Email, CargoMinisterial) VALUES (@id, @n, @c, 'ATIVO', @d, @t, @e, @cg)`,
    { id, n: nome, c: cong, d: new Date(`${nasc}T00:00:00Z`), t: extra.telefone || `91 9${id}`, e: extra.email || `p${id}@e2e.invalid`, cg: extra.cargo || "MEMBRO" });
  await membro(P.superintendente, "Superintendente Norte E2E", c1, "1970-01-01", { cargo: "PASTOR" });
  const papelSup = await escalar("SELECT PapelId FROM Papeis WHERE Nome = N'Superintendente Regional'");
  await q("IF NOT EXISTS (SELECT 1 FROM Lideranca WHERE MembroId = @m) INSERT INTO Lideranca (MembroId, PapelId, EscopoTipo, EscopoId, SenhaHash) VALUES (@m, @p, 'REGIAO', @r, N'x')", { m: P.superintendente, p: papelSup, r: regiao });
  await q("UPDATE MembroReferencia SET CargoMinisterial = 'PASTOR' WHERE MembroId = 3003");           // o Pastor de Área é pastor
  await q("UPDATE MembroReferencia SET CargoMinisterial = 'PRESBITERO' WHERE MembroId = 3001");       // o Dirigente da Central é presbítero (não lê "somente pastor")
  await q("UPDATE MembroReferencia SET Email = N'dirigente3001@e2e.invalid' WHERE MembroId = 3001 AND Email IS NULL");
  const nomes = { ana: "Ana Cuidado E2E", bento: "Bento Cuidado E2E", carla: "Carla Cuidado E2E", davi: "Davi Cuidado E2E", elisa: "Elisa Cuidado E2E", fabio: "Fabio Cuidado E2E",
    gabi: "Gabi Cuidado E2E", hugo: "Hugo Cuidado E2E", iris: "Iris Cuidado E2E", joao: "Joao Cuidado E2E" };
  for (const [k, n] of Object.entries(nomes)) await membro(P[k], n, c1);
  await membro(P.menor, "Menino Cuidado E2E", c1, somarDias(hojeBr(), -365 * 12));
  await membro(P.vilaA, "Vila A Cuidado E2E", c2); await membro(P.vilaB, "Vila B Cuidado E2E", c2);
  await membro(P.beta, "Beta Cuidado E2E", c3);
  await membro(P.saiu, "Saiu Cuidado E2E", c1);
  await q("UPDATE MembroReferencia SET SituacaoMembro = 'SEM_COMUNHAO' WHERE MembroId = @m", { m: P.elisa });   // já está no caminho do abandono: a detecção não a pega
  ok((await escalar("SELECT COUNT(*) FROM Lideranca l JOIN Papeis p ON p.PapelId = l.PapelId WHERE l.EscopoTipo = 'REGIAO' AND p.Nome = N'Superintendente Regional'")) === 1, "o Superintendente Regional está cadastrado na Região da Área Alfa");

  console.log("== cenário: a frequência da EBD para a detecção (30 domingos) ==");
  // Ana: vinha 9 de 10 e caiu para 1 de 6 (SINAL). Bento: sempre 1 de 4 (sem costume: NÃO é sinal). Carla: firme (NÃO). Davi: caiu (SINAL, mas vai ter abandono aberto).
  // Elisa: caiu, mas já é "sem comunhão" (NÃO). Fabio: caiu só um pouco, 90% → 67% (NÃO). Hugo: caiu, e também nas reuniões (SINAL, fontes EBD e reuniões).
  const turma = (await q("IF NOT EXISTS (SELECT 1 FROM EbdTurmas WHERE Nome = N'Adultos Cuidado E2E') INSERT INTO EbdTurmas (CongregacaoId, Nome) VALUES (@c, N'Adultos Cuidado E2E'); SELECT TurmaId FROM EbdTurmas WHERE Nome = N'Adultos Cuidado E2E'", { c: c1 }))[0].TurmaId;
  const alunos = {};
  for (const k of ["ana", "bento", "carla", "davi", "elisa", "fabio", "hugo"]) {
    alunos[k] = (await q("IF NOT EXISTS (SELECT 1 FROM EbdAlunos WHERE MembroId = @m AND TurmaId = @t) INSERT INTO EbdAlunos (MembroId, TurmaId, Matricula) VALUES (@m, @t, @mt); SELECT AlunoId FROM EbdAlunos WHERE MembroId = @m AND TurmaId = @t",
      { m: P[k], t: turma, mt: String(P[k]) }))[0].AlunoId;
  }
  const hoje = hojeBr();
  const presente = {
    ana: (i) => (i < 6 ? i === 2 : i % 10 !== 0),
    bento: (i) => i % 4 === 0,
    carla: (i) => i % 10 !== 5,
    davi: (i) => (i < 6 ? false : true),
    elisa: (i) => (i < 6 ? false : true),
    fabio: (i) => (i < 6 ? i % 3 !== 0 : i % 10 !== 0),
    hugo: (i) => (i < 6 ? false : i % 5 !== 0)
  };
  let chamadas = 0;
  for (let i = 0; i < 30; i++) {
    const data = somarDias(hoje, -7 * i - 1);
    const licao = (await q("IF NOT EXISTS (SELECT 1 FROM EbdLicoes WHERE CongregacaoId = @c AND Data = @d) INSERT INTO EbdLicoes (CongregacaoId, Data, Status) VALUES (@c, @d, 'FECHADA'); SELECT LicaoId FROM EbdLicoes WHERE CongregacaoId = @c AND Data = @d",
      { c: c1, d: new Date(`${data}T00:00:00Z`) }))[0].LicaoId;
    for (const k of Object.keys(alunos)) {
      await q("IF NOT EXISTS (SELECT 1 FROM EbdChamadas WHERE LicaoId = @l AND AlunoId = @a) INSERT INTO EbdChamadas (LicaoId, TurmaId, AlunoId, Status) VALUES (@l, @t, @a, @s)",
        { l: licao, t: turma, a: alunos[k], s: presente[k](i) ? "PRESENTE" : "AUSENTE" });
      chamadas++;
    }
  }
  ok((await escalar("SELECT COUNT(*) FROM EbdChamadas WHERE TurmaId = @t", { t: turma })) === chamadas, `${chamadas} chamadas da EBD gravadas (com a ausência explícita)`);
  // reuniões encerradas em que o Hugo era esperado e faltou nas recentes
  for (let i = 0; i < 8; i++) {
    const data = somarDias(hoje, -14 * i - 3);
    const s = (await q("INSERT INTO Sessoes (Descricao, DataSessao, TipoSessao, Status) VALUES (N'Reunião Cuidado E2E', @d, 'ORDINARIA', 'ENCERRADA'); SELECT CAST(SCOPE_IDENTITY() AS INT) AS id", { d: new Date(`${data}T00:00:00Z`) }))[0].id;
    await q("INSERT INTO Presencas (SessaoId, MembroId, Presente) VALUES (@s, @m, @p)", { s, m: P.hugo, p: i >= 3 });
  }
  // o Davi já tem procedimento de abandono aberto: a detecção não o pega
  await q("IF NOT EXISTS (SELECT 1 FROM ProcedimentosAbandono WHERE MembroId = @m) INSERT INTO ProcedimentosAbandono (MembroId, DataNotificacao, Status, Tipo) VALUES (@m, @d, 'NOTIFICADO', 'MATERIAL')", { m: P.davi, d: new Date() });

  console.log("== gatilhos e CHECK: o pedido de oração ==");
  const pedidoBase = { c: c1, s: P.ana, r: P.ana };
  const pedido = (await q(`INSERT INTO PedidosOracao (CongregacaoId, SolicitanteMembroId, RegistradoPorMembroId, ParaQuem, Categoria, Texto, PodeBoletim, QuerContato)
    VALUES (@c, @s, @r, 'PROPRIO', 'SAUDE', N'TESTE148 pedido', 1, 0); SELECT CAST(SCOPE_IDENTITY() AS INT) AS id`, pedidoBase))[0].id;
  await nega("pedido sem texto e sem anonimização é recusado", "INSERT INTO PedidosOracao (CongregacaoId, SolicitanteMembroId, RegistradoPorMembroId, ParaQuem, Categoria, Texto, PodeBoletim, QuerContato) VALUES (@c, @s, @r, 'PROPRIO', 'SAUDE', NULL, 1, 0)", pedidoBase, /CK_PedidosOracao_Texto/);
  await nega("assunto fora da lista é recusado", "INSERT INTO PedidosOracao (CongregacaoId, SolicitanteMembroId, RegistradoPorMembroId, ParaQuem, Categoria, Texto, PodeBoletim, QuerContato) VALUES (@c, @s, @r, 'PROPRIO', 'POLITICA', N'x', 1, 0)", pedidoBase, /CK_PedidosOracao_Categoria/);
  await nega("pedido sem ninguém (nem matrícula nem nome) é recusado", "INSERT INTO PedidosOracao (CongregacaoId, RegistradoPorMembroId, ParaQuem, Categoria, Texto, PodeBoletim, QuerContato) VALUES (@c, @r, 'PROPRIO', 'SAUDE', N'x', 1, 0)", pedidoBase, /CK_PedidosOracao_Quem/);
  await nega("aprovado sem a linha do boletim é recusado", "UPDATE PedidosOracao SET Moderacao = 'APROVADO', ModeradoPorMembroId = 3001 WHERE PedidoId = @p", { p: pedido }, /CK_PedidosOracao_Aprovado/);
  await nega("aprovado com sinal de risco é recusado", "UPDATE PedidosOracao SET Moderacao = 'APROVADO', TextoBoletim = N'linha', BoletimAte = '2030-01-01', ModeradoPorMembroId = 3001, Risco = 1, RiscoOrigem = 'LIDERANCA', RiscoJaTeve = 1 WHERE PedidoId = @p", { p: pedido }, /CK_PedidosOracao_Aprovado/);
  await nega("aprovado de quem pediu \"só para a liderança\" é recusado", "UPDATE PedidosOracao SET PodeBoletim = 0, Moderacao = 'APROVADO', TextoBoletim = N'linha', BoletimAte = '2030-01-01', ModeradoPorMembroId = 3001 WHERE PedidoId = @p", { p: pedido }, /CK_PedidosOracao_Aprovado/);
  await nega("risco sem a origem é recusado", "UPDATE PedidosOracao SET Risco = 1 WHERE PedidoId = @p", { p: pedido }, /CK_PedidosOracao_RiscoMarca/);
  await nega("o texto do pedido não se reescreve", "UPDATE PedidosOracao SET Texto = N'outro' WHERE PedidoId = @p", { p: pedido }, /não se reescreve/);
  await nega("quem pediu não se troca", "UPDATE PedidosOracao SET SolicitanteMembroId = @o WHERE PedidoId = @p", { p: pedido, o: P.bento }, /não se reescreve/);
  await nega("o assunto não se troca", "UPDATE PedidosOracao SET Categoria = 'LUTO' WHERE PedidoId = @p", { p: pedido }, /não se reescreve/);
  await nega("o pedido não se apaga", "DELETE FROM PedidosOracao WHERE PedidoId = @p", { p: pedido }, /não se apaga/);
  await aceita("a moderação e a marca de risco mudam (é o trabalho do pedido)", "UPDATE PedidosOracao SET Risco = 1, RiscoOrigem = 'LIDERANCA', RiscoJaTeve = 1 WHERE PedidoId = @p", { p: pedido });
  await nega("\"já teve risco\" não volta a zero (guarda de 5 anos)", "UPDATE PedidosOracao SET Risco = 0, RiscoJaTeve = 0 WHERE PedidoId = @p", { p: pedido }, /não se reescreve/);
  await nega("anonimizar pela metade (o nome fica) é recusado", "UPDATE PedidosOracao SET Texto = NULL, AnonimizadoEm = SYSUTCDATETIME() WHERE PedidoId = @p", { p: pedido }, /CK_PedidosOracao_Anonimizado/);
  await aceita("anonimizar de verdade (texto, quem pediu, quem registrou) passa", "UPDATE PedidosOracao SET Texto = NULL, SolicitanteMembroId = NULL, RegistradoPorMembroId = NULL, AnonimizadoEm = SYSUTCDATETIME() WHERE PedidoId = @p", { p: pedido });
  await nega("depois de anonimizado, o carimbo não muda", "UPDATE PedidosOracao SET AnonimizadoEm = '2000-01-01' WHERE PedidoId = @p", { p: pedido }, /não se reescreve/);

  console.log("== gatilhos e CHECK: o item e o histórico ==");
  const prazo = new Date(Date.now() + 86400000);
  const item = (await q("INSERT INTO CuidadoItens (Tipo, CongregacaoId, MembroId, Origem, PrazoEm, Motivo) VALUES ('AFASTAMENTO', @c, @m, 'LIDERANCA', @pz, N'TESTE148'); SELECT CAST(SCOPE_IDENTITY() AS INT) AS id", { c: c1, m: P.joao, pz: prazo }))[0].id;
  await nega("dois \"membro afastado\" abertos para a mesma pessoa: o índice único recusa", "INSERT INTO CuidadoItens (Tipo, CongregacaoId, MembroId, Origem, PrazoEm) VALUES ('AFASTAMENTO', @c, @m, 'DETECCAO', @pz)", { c: c1, m: P.joao, pz: prazo }, /UX_CuidadoItens_UmAbertoPorPessoa/);
  await aceita("um \"pedido de visita\" aberto da mesma pessoa convive com o afastamento (outro tipo)", "INSERT INTO CuidadoItens (Tipo, CongregacaoId, MembroId, Origem, PrazoEm, Motivo) VALUES ('PEDIDO_VISITA', @c, @m, 'PEDIDO_MEMBRO', @pz, N'TESTE148')", { c: c1, m: P.joao, pz: prazo });
  await nega("item sem pessoa é recusado", "INSERT INTO CuidadoItens (Tipo, CongregacaoId, Origem, PrazoEm) VALUES ('VISITANTE', @c, 'LIDERANCA', @pz)", { c: c1, pz: prazo }, /CK_CuidadoItens_Pessoa/);
  await nega("tipo fora da lista é recusado", "INSERT INTO CuidadoItens (Tipo, CongregacaoId, PessoaNome, Origem, PrazoEm) VALUES ('FOFOCA', @c, N'X', 'LIDERANCA', @pz)", { c: c1, pz: prazo }, /CK_CuidadoItens_Tipo/);
  await nega("concluído sem desfecho é recusado", "UPDATE CuidadoItens SET Status = 'CONCLUIDO', EncerradoEm = SYSUTCDATETIME() WHERE ItemId = @i", { i: item }, /CK_CuidadoItens_Encerramento/);
  await nega("cancelado com desfecho de conclusão é recusado", "UPDATE CuidadoItens SET Status = 'CANCELADO', Desfecho = 'INTEGRADO', EncerradoEm = SYSUTCDATETIME() WHERE ItemId = @i", { i: item }, /CK_CuidadoItens_Encerramento/);
  await nega("o tipo do item não se troca", "UPDATE CuidadoItens SET Tipo = 'VISITANTE' WHERE ItemId = @i", { i: item }, /não se reescreve/);
  await nega("a pessoa do item não se troca", "UPDATE CuidadoItens SET MembroId = @o WHERE ItemId = @i", { i: item, o: P.iris }, /não se reescreve/);
  await nega("a congregação do item não se troca", "UPDATE CuidadoItens SET CongregacaoId = @c WHERE ItemId = @i", { i: item, c: c2 }, /não se reescreve/);
  await nega("o motivo não se reescreve (só a anonimização o apaga)", "UPDATE CuidadoItens SET Motivo = N'outro' WHERE ItemId = @i", { i: item }, /não se reescreve/);
  await aceita("o responsável, o prazo e o degrau mudam enquanto aberto", "UPDATE CuidadoItens SET ResponsavelMembroId = 3001, PrazoEm = DATEADD(DAY, 2, PrazoEm), Nivel = 'AREA' WHERE ItemId = @i", { i: item });
  await aceita("concluir com desfecho passa", "UPDATE CuidadoItens SET Status = 'CONCLUIDO', Desfecho = 'INTEGRADO', EncerradoEm = SYSUTCDATETIME() WHERE ItemId = @i", { i: item });
  await nega("encerrado não reabre", "UPDATE CuidadoItens SET Status = 'ABERTO', Desfecho = NULL, EncerradoEm = NULL WHERE ItemId = @i", { i: item }, /não se reescreve/);
  await nega("encerrado não troca de responsável", "UPDATE CuidadoItens SET ResponsavelMembroId = 3003 WHERE ItemId = @i", { i: item }, /não se reescreve/);
  await nega("o item não se apaga", "DELETE FROM CuidadoItens WHERE ItemId = @i", { i: item }, /não se apaga/);
  await nega("anonimizar mantendo a matrícula é recusado (seria só pseudônimo)", "UPDATE CuidadoItens SET Motivo = NULL, AnonimizadoEm = SYSUTCDATETIME() WHERE ItemId = @i", { i: item }, /CK_CuidadoItens_Anonimizado/);
  const ev = (await q("INSERT INTO CuidadoEventos (ItemId, Tipo, MembroId, Forma, Conseguiu, Acompanhante, Observacao) VALUES (@i, 'CONTATO', 3001, 'VISITA_LAR', 1, N'Diácono Fulano', N'TESTE148 obs'); SELECT CAST(SCOPE_IDENTITY() AS INT) AS id", { i: item }))[0].id;
  await nega("visita sem quem foi junto é recusada (Regimento Art. 85 §3º)", "INSERT INTO CuidadoEventos (ItemId, Tipo, MembroId, Forma, Conseguiu) VALUES (@i, 'CONTATO', 3001, 'VISITA_HOSPITAL', 1)", { i: item }, /CK_CuidadoEventos_Visita/);
  await nega("contato sem a forma é recusado", "INSERT INTO CuidadoEventos (ItemId, Tipo, MembroId, Conseguiu) VALUES (@i, 'CONTATO', 3001, 1)", { i: item }, /CK_CuidadoEventos_Contato/);
  await nega("o histórico não se altera", "UPDATE CuidadoEventos SET Observacao = N'reescrito' WHERE EventoId = @e", { e: ev }, /não se altera/);
  await nega("o histórico não se apaga", "DELETE FROM CuidadoEventos WHERE EventoId = @e", { e: ev }, /não se apaga/);
  await nega("anonimizar o histórico mantendo a observação é recusado", "UPDATE CuidadoEventos SET AnonimizadoEm = SYSUTCDATETIME() WHERE EventoId = @e", { e: ev }, /não se altera/);
  await aceita("anonimizar o histórico (observação fora, acompanhante neutro) passa", "UPDATE CuidadoEventos SET Observacao = NULL, Acompanhante = N'(anonimizado)', AnonimizadoEm = SYSUTCDATETIME() WHERE EventoId = @e", { e: ev });
  await nega("e depois de anonimizado não muda mais", "UPDATE CuidadoEventos SET Acompanhante = NULL, AnonimizadoEm = SYSUTCDATETIME() WHERE EventoId = @e", { e: ev }, /não se altera/);
  await aceita("anonimizar o item de verdade (matrícula, nome, contato, motivo fora) passa", "UPDATE CuidadoItens SET MembroId = NULL, PessoaNome = NULL, PessoaContato = NULL, Motivo = NULL, DeteccaoResumo = NULL, AnonimizadoEm = SYSUTCDATETIME() WHERE ItemId = @i", { i: item });

  console.log("== gatilhos: a nota pastoral e a marca de purga ==");
  const nota = (await q("INSERT INTO NotasPastorais (MembroId, Nivel, Texto, AutorMembroId) VALUES (@m, 'PASTORAL', N'TESTE148 nota', 3003); SELECT CAST(SCOPE_IDENTITY() AS INT) AS id", { m: P.iris }))[0].id;
  await q("INSERT INTO NotasPastoraisLeituras (NotaId, MembroId) VALUES (@n, 3003)", { n: nota });
  await nega("nota sobre um membro E um item ao mesmo tempo é recusada", "INSERT INTO NotasPastorais (MembroId, ItemId, Nivel, Texto, AutorMembroId) VALUES (@m, @i, 'EQUIPE', N'x', 3003)", { m: P.iris, i: item }, /CK_NotasPastorais_Alvo/);
  await nega("nível fora da lista é recusado", "INSERT INTO NotasPastorais (MembroId, Nivel, Texto, AutorMembroId) VALUES (@m, 'PUBLICA', N'x', 3003)", { m: P.iris }, /CK_NotasPastorais_Nivel/);
  await nega("a nota não se edita", "UPDATE NotasPastorais SET Texto = N'outro' WHERE NotaId = @n", { n: nota }, /não se edita/);
  const nota0 = (await q("INSERT INTO NotasPastorais (MembroId, Nivel, Texto, AutorMembroId) VALUES (@m, 'LIDERANCA', N'TESTE148 nota 0', 3003); SELECT CAST(SCOPE_IDENTITY() AS INT) AS id", { m: P.iris }))[0].id;
  await nega("a nota (sem leitura) não sai sem a marca de purga: o gatilho recusa", "DELETE FROM NotasPastorais WHERE NotaId = @n", { n: nota0 }, /Regimento|LGPD/);
  await nega("o registro de leitura não se altera", "UPDATE NotasPastoraisLeituras SET MembroId = 3001 WHERE NotaId = @n", { n: nota }, /não se altera/);
  await nega("o registro de leitura não sai sem a marca", "DELETE FROM NotasPastoraisLeituras WHERE NotaId = @n", { n: nota }, /junto com a nota/);
  await aceita("com a marca de purga na mesma transação, a nota e a leitura saem", `BEGIN TRAN; EXEC sp_set_session_context @key = N'cuidado_purga', @value = 1;
    DELETE FROM NotasPastoraisLeituras WHERE NotaId = @n; DELETE FROM NotasPastorais WHERE NotaId = @n; EXEC sp_set_session_context @key = N'cuidado_purga', @value = NULL; COMMIT`, { n: nota });
  ok((await escalar("SELECT COUNT(*) FROM NotasPastorais WHERE NotaId = @n", { n: nota })) === 0, "a nota saiu de fato");
  ok((await escalar("SELECT CAST(SESSION_CONTEXT(N'cuidado_purga') AS INT)")) === null, "e a marca não ficou ligada na conexão");
  const nota2 = (await q("INSERT INTO NotasPastorais (MembroId, Nivel, Texto, AutorMembroId) VALUES (@m, 'EQUIPE', N'TESTE148 nota 2', 3003); SELECT CAST(SCOPE_IDENTITY() AS INT) AS id", { m: P.iris }))[0].id;
  await nega("com a marca desligada de novo, apagar volta a ser recusado", "DELETE FROM NotasPastorais WHERE NotaId = @n", { n: nota2 }, /Regimento|LGPD/);

  console.log("== limpeza dos registros de teste dos gatilhos ==");
  await q(`DISABLE TRIGGER ALL ON dbo.CuidadoEventos; DISABLE TRIGGER ALL ON dbo.CuidadoItens; DISABLE TRIGGER ALL ON dbo.PedidosOracao; DISABLE TRIGGER ALL ON dbo.NotasPastorais; DISABLE TRIGGER ALL ON dbo.NotasPastoraisLeituras;
    DELETE FROM NotasPastoraisLeituras; DELETE FROM NotasPastorais; DELETE FROM CuidadoEventos; DELETE FROM CuidadoItens; DELETE FROM PedidosOracao;
    ENABLE TRIGGER ALL ON dbo.CuidadoEventos; ENABLE TRIGGER ALL ON dbo.CuidadoItens; ENABLE TRIGGER ALL ON dbo.PedidosOracao; ENABLE TRIGGER ALL ON dbo.NotasPastorais; ENABLE TRIGGER ALL ON dbo.NotasPastoraisLeituras;`);
  ok((await escalar("SELECT COUNT(*) FROM sys.triggers WHERE parent_id IN (OBJECT_ID('dbo.CuidadoEventos'), OBJECT_ID('dbo.CuidadoItens'), OBJECT_ID('dbo.PedidosOracao'), OBJECT_ID('dbo.NotasPastorais'), OBJECT_ID('dbo.NotasPastoraisLeituras')) AND is_disabled = 0")) === 5, "os 5 gatilhos voltaram ligados");
  ok((await escalar("SELECT (SELECT COUNT(*) FROM CuidadoItens) + (SELECT COUNT(*) FROM PedidosOracao) + (SELECT COUNT(*) FROM NotasPastorais)")) === 0, "a base sai limpa (sem item, pedido nem nota)");
  fim("e2e-23 (migração 148 e cenário do cuidado pastoral)");
})().catch((e) => { console.log("ERRO FATAL:", e && e.stack); L.shimEncerrar(); process.exitCode = 1; });
