// e2e-1-setup.js — o cenário (congregações, pessoas, lideranças, canal) e as garantias da migração 142 sobre o banco. Rodar sobre banco recém-criado.
const fs = require("fs");
const { q, um, escalar, ok, fim, API, path } = require("./lib");

(async () => {
  console.log("== migração 142: grants, coluna alargada, catálogo ==");
  const larg = await escalar("SELECT CHARACTER_MAXIMUM_LENGTH FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'Papeis' AND COLUMN_NAME = 'Permissoes'");
  ok(larg >= 1000, "Papeis.Permissoes alargada para 1000", larg);
  for (const nome of ["Presidente", "Secretário Geral"]) {
    const p = await escalar("SELECT Permissoes FROM Papeis WHERE Nome = @n", { n: nome });
    for (const k of ["setores_tecnicos", "setores_ratificacao", "vistoria_antecedentes"]) ok(`,${p},`.includes(`,${k},`), `${nome} recebeu ${k}`);
  }
  const outros = await q("SELECT Nome FROM Papeis WHERE Nome NOT IN ('Presidente', 'Secretário Geral') AND ((',' + ISNULL(Permissoes, '') + ',') LIKE '%,setores[_]%' OR (',' + ISNULL(Permissoes, '') + ',') LIKE '%,vistoria_antecedentes,%')");
  ok(outros.length === 0, "nenhum outro papel recebeu as permissões novas", outros);
  ok((await escalar("SELECT COUNT(*) FROM SetoresTecnicos")) === 20, "20 setores semeados");
  ok((await escalar("SELECT COUNT(*) FROM NotificacaoRegras WHERE Chave LIKE 'SETOR[_]%' OR Chave LIKE 'VISTORIA[_]%'")) === 10, "10 regras de aviso");
  ok((await escalar("SELECT COUNT(*) FROM NotificacaoRegras WHERE (Chave LIKE 'SETOR[_]%' OR Chave LIKE 'VISTORIA[_]%') AND Obrigatoria = 1")) === 7, "7 regras obrigatórias");
  ok((await escalar("SELECT COUNT(*) FROM Prazos WHERE Sigla IN ('SETOR_INTERDICAO_LEMBRETE_DIAS', 'SETOR_REMOCAO_LEMBRETE_DIAS')")) === 2, "2 prazos");

  console.log("== o cenário ==");
  const area1 = (await q("INSERT INTO Areas (Nome) VALUES (N'Área Alfa E2E'); SELECT CAST(SCOPE_IDENTITY() AS INT) AS id"))[0].id;
  const area2 = (await q("INSERT INTO Areas (Nome) VALUES (N'Área Beta E2E'); SELECT CAST(SCOPE_IDENTITY() AS INT) AS id"))[0].id;
  const cong = {};
  for (const [chave, nome, area] of [["central", "Central E2E", area1], ["vila", "Vila Nova E2E", area1], ["beta", "Beta E2E", area2]]) {
    const id = (await q("INSERT INTO Congregacoes (Nome, AreaId) VALUES (@n, @a); SELECT CAST(SCOPE_IDENTITY() AS INT) AS id", { n: nome, a: area }))[0].id;
    cong[chave] = { id, nome };
  }
  const pessoas = [
    [1001, "Presidente E2E", "1965-03-10", "central", "EM_COMUNHAO", "ATIVO"], [1002, "Secretário Geral E2E", "1970-05-01", "central", "EM_COMUNHAO", "ATIVO"],
    [1003, "Gestora de Setores E2E", "1980-01-01", "central", "EM_COMUNHAO", "ATIVO"],
    [3001, "Dirigente Central E2E", "1975-02-02", "central", "EM_COMUNHAO", "ATIVO"], [3002, "Dirigente Vila Nova E2E", "1976-02-02", "vila", "EM_COMUNHAO", "ATIVO"],
    [3003, "Pastor de Área Alfa E2E", "1972-02-02", "central", "EM_COMUNHAO", "ATIVO"], [3004, "Dirigente Beta E2E", "1977-02-02", "beta", "EM_COMUNHAO", "ATIVO"],
    [2001, "Eng Ana E2E", "1985-04-04", "central", "EM_COMUNHAO", "ATIVO"], [2002, "Seg Beto E2E", "1980-04-04", "central", "EM_COMUNHAO", "ATIVO"],
    [2003, "Com Carla E2E", "1990-04-04", "vila", "EM_COMUNHAO", "ATIVO"], [2004, "Adv Davi E2E", "1978-04-04", "central", "EM_COMUNHAO", "ATIVO"],
    [2005, "Candidata Eva E2E", "1992-04-04", "central", "EM_COMUNHAO", "ATIVO"], [2006, "Menor Fabio E2E", "2012-04-04", "central", "EM_COMUNHAO", "ATIVO"],
    [2007, "Sem Nascimento E2E", null, "central", "EM_COMUNHAO", "ATIVO"], [2008, "Sem Comunhao E2E", "1988-04-04", "central", "SEM_COMUNHAO", "ATIVO"],
    [2009, "Desligado E2E", "1988-04-04", "central", "EM_COMUNHAO", "DESLIGADO"], [2010, "Eng Gil E2E", "1983-04-04", "vila", "EM_COMUNHAO", "ATIVO"],
    [2011, "Com Hugo E2E", "1991-04-04", "beta", "EM_COMUNHAO", "ATIVO"], [2012, "Outro Ivo E2E", "1991-04-04", "central", "EM_COMUNHAO", "ATIVO"],
    [5001, "Gatilho Um E2E", "1980-01-01", "central", "EM_COMUNHAO", "ATIVO"], [5002, "Gatilho Dois E2E", "1980-01-01", "central", "EM_COMUNHAO", "ATIVO"], [5003, "Gatilho Tres E2E", "1980-01-01", "central", "EM_COMUNHAO", "ATIVO"], [5004, "Gatilho Quatro E2E", "1980-01-01", "central", "EM_COMUNHAO", "ATIVO"],
    [4001, "Admin do Canal E2E", "1975-04-04", "central", "EM_COMUNHAO", "ATIVO"]
  ];
  for (const [id, nome, nasc, c, situacao, status] of pessoas) {
    await q("INSERT INTO MembroReferencia (MembroId, Nome, CongregacaoId, Status, SituacaoMembro, DataNascimento, Email) VALUES (@id, @n, @c, @st, @si, @nasc, @em)",
      { id, n: nome, c: cong[c].id, st: status, si: situacao, nasc: nasc ? new Date(`${nasc}T00:00:00Z`) : null, em: `p${id}@exemplo.org` });
  }
  // As chaves de data nula acima viram parâmetro de texto "null"? Garante NULL de verdade.
  await q("UPDATE MembroReferencia SET DataNascimento = NULL WHERE MembroId = 2007");
  const papel = async (nome) => escalar("SELECT PapelId FROM Papeis WHERE Nome = @n", { n: nome });
  const gestor = (await q("INSERT INTO Papeis (Nome, Nivel, Permissoes) VALUES (N'Gestor de Setores E2E', 'GLOBAL', 'setores_tecnicos'); SELECT CAST(SCOPE_IDENTITY() AS INT) AS id"))[0].id;
  const lid = (m, p, t, e) => q("INSERT INTO Lideranca (MembroId, PapelId, EscopoTipo, EscopoId) VALUES (@m, @p, @t, @e)", { m, p, t, e });
  await lid(1001, await papel("Presidente"), "GLOBAL", null);
  await lid(1002, await papel("Secretário Geral"), "GLOBAL", null);
  await lid(1003, gestor, "GLOBAL", null);
  await lid(3001, await papel("Dirigente de Congregação"), "CONGREGACAO", cong.central.id);
  await lid(3002, await papel("Dirigente de Congregação"), "CONGREGACAO", cong.vila.id);
  await lid(3003, await papel("Pastor de Área"), "AREA", area1);
  await lid(3004, await papel("Dirigente de Congregação"), "CONGREGACAO", cong.beta.id);
  const canalId = (await q("INSERT INTO CanaisOficiaisComunicacao (Sigla, Nome, Ativo, Plataforma, Identificador, Escopo, CongregacaoId) VALUES (N'INSTAGRAM_E2E', N'Instagram da Central E2E', 1, N'INSTAGRAM', N'@central_e2e', N'CONGREGACAO', @c); SELECT CAST(SCOPE_IDENTITY() AS INT) AS id", { c: cong.central.id }))[0].id;
  await q("INSERT INTO CanalAdministradores (CanalId, MembroId, Papel) VALUES (@c, 4001, 'ADMINISTRADOR')", { c: canalId });
  const setores = {};
  for (const s of await q("SELECT SetorId, Codigo FROM SetoresTecnicos")) setores[s.Codigo] = s.SetorId;
  fs.writeFileSync(path.join(__dirname, "cenario.json"), JSON.stringify({ cong, area1, area2, canalId, setores, gestor }, null, 1));
  console.log("cenário gravado:", JSON.stringify({ cong, canalId }));

  console.log("== idempotência: reaplicar só a 142 sobre o banco já migrado e com papéis modificados ==");
  // Tira as permissões do Presidente e reaplica: a 142 devolve (aditivo) e não duplica nas demais.
  await q("UPDATE Papeis SET Permissoes = REPLACE(Permissoes, ',setores_ratificacao', '') WHERE Nome = 'Presidente'");
  const antes = await escalar("SELECT Permissoes FROM Papeis WHERE Nome = 'Secretário Geral'");
  const sqlTexto = fs.readFileSync(path.join(API, "../sql/migrations/142_setores_tecnicos.sql"), "utf8");
  const { obterPool } = require("./lib");
  const pool = await obterPool();
  for (const lote of sqlTexto.split(/^\s*GO\s*$/gim).map(t => t.trim()).filter(Boolean)) await pool.request().query(lote);
  const depois = await escalar("SELECT Permissoes FROM Papeis WHERE Nome = 'Secretário Geral'");
  ok(antes === depois, "reaplicar a 142 não duplica permissão de quem já tinha");
  ok(`,${await escalar("SELECT Permissoes FROM Papeis WHERE Nome = 'Presidente'")},`.includes(",setores_ratificacao,"), "reaplicar a 142 devolve a permissão retirada do Presidente");
  ok((await escalar("SELECT COUNT(*) FROM SetoresTecnicos")) === 20, "reaplicar não duplica os 20 setores");
  ok((await escalar("SELECT COUNT(*) FROM NotificacaoRegras WHERE Chave LIKE 'SETOR[_]%' OR Chave LIKE 'VISTORIA[_]%'")) === 10, "reaplicar não duplica as regras de aviso");
  const dupPerm = await escalar("SELECT COUNT(*) FROM Papeis WHERE Nome = 'Presidente' AND Permissoes LIKE '%setores_ratificacao,%setores_ratificacao%'");
  ok(dupPerm === 0, "nenhuma permissão repetida na lista do Presidente");

  console.log("== gatilhos e CHECK do banco ==");
  const falha = async (texto, params, padrao) => { try { await q(texto, params); return null; } catch (e) { return e.message; } };
  let m;
  // vínculo
  await q("INSERT INTO SetoresTecnicosMembros (SetorId, MembroId, Status, Origem, Formacao, CriadoPorMembroId) VALUES (@s, 5001, 'CANDIDATO', 'CANDIDATURA', N'Teste', 5001)", { s: setores.LIBRAS });
  const vid = await escalar("SELECT VinculoId FROM SetoresTecnicosMembros WHERE MembroId = 5001");
  m = await falha("DELETE FROM SetoresTecnicosMembros WHERE VinculoId = @v", { v: vid }); ok(m && /não se apaga/.test(m), "vínculo não se apaga", m);
  m = await falha("UPDATE SetoresTecnicosMembros SET MembroId = 2005 WHERE VinculoId = @v", { v: vid }); ok(m && /não muda de pessoa/.test(m), "vínculo não muda de pessoa", m);
  m = await falha("INSERT INTO SetoresTecnicosMembros (SetorId, MembroId, Status, Origem, Formacao, CriadoPorMembroId) VALUES (@s, 5001, 'CANDIDATO', 'CANDIDATURA', N'Teste', 5001)", { s: setores.LIBRAS }); ok(m && /UX_SetoresMembros_Vigente|duplicate/i.test(m), "um vínculo vigente por pessoa e setor", m);
  m = await falha("UPDATE SetoresTecnicosMembros SET Status = 'ATIVO' WHERE VinculoId = @v", { v: vid }); ok(m && /CK_SetoresMembros_Ativo/.test(m), "ATIVO exige AtivadoEm", m);
  m = await falha("UPDATE SetoresTecnicosMembros SET Status = 'ENCERRADO' WHERE VinculoId = @v", { v: vid }); ok(m && /CK_SetoresMembros_Encerrado/.test(m), "ENCERRADO exige data e motivo", m);
  m = await falha("UPDATE SetoresTecnicosMembros SET ConselhoSigla = 'CREA' WHERE VinculoId = @v", { v: vid }); ok(m && /CK_SetoresMembros_Registro/.test(m), "sigla sem número é recusada", m);
  await q("UPDATE SetoresTecnicosMembros SET Status = 'ENCERRADO', EncerradoEm = SYSUTCDATETIME(), MotivoEncerramento = 'OUTRO' WHERE VinculoId = @v", { v: vid });
  m = await falha("UPDATE SetoresTecnicosMembros SET Status = 'CANDIDATO', EncerradoEm = NULL, MotivoEncerramento = NULL WHERE VinculoId = @v", { v: vid }); ok(m && /não é reaberto/.test(m), "vínculo encerrado não reabre", m);
  await q("INSERT INTO SetoresTecnicosMembros (SetorId, MembroId, Status, Origem, Formacao, CriadoPorMembroId) VALUES (@s, 5001, 'CANDIDATO', 'CANDIDATURA', N'Teste', 5001)", { s: setores.LIBRAS });
  ok(true, "depois de encerrado, voltar é um vínculo novo");
  await q("UPDATE SetoresTecnicosMembros SET Status = 'ENCERRADO', EncerradoEm = SYSUTCDATETIME(), MotivoEncerramento = 'OUTRO' WHERE MembroId = 5001 AND Status = 'CANDIDATO'");
  // adesão
  const v2 = (await q("INSERT INTO SetoresTecnicosMembros (SetorId, MembroId, Status, Origem, Formacao, CriadoPorMembroId, AtivadoEm) VALUES (@s, 5002, 'ATIVO', 'INDICACAO', N'Teste', 1001, SYSUTCDATETIME()); SELECT CAST(SCOPE_IDENTITY() AS INT) AS id", { s: setores.TRANSPORTE }))[0].id;
  m = await falha("INSERT INTO SetoresTecnicosAdesoes (VinculoId, MembroId, SetorId, Forma, DataAceite) VALUES (@v, 5002, @s, 'CLICKWRAP', '2026-10-01')", { v: v2, s: setores.TRANSPORTE }); ok(m && /CK_SetoresAdesoes_Click/.test(m), "clickwrap sem hash, IP e hora é recusado", m);
  m = await falha("INSERT INTO SetoresTecnicosAdesoes (VinculoId, MembroId, SetorId, Forma, DataAceite) VALUES (@v, 5002, @s, 'FICHA_FISICA', '2026-10-01')", { v: v2, s: setores.TRANSPORTE }); ok(m && /CK_SetoresAdesoes_Ficha/.test(m), "ficha sem referência é recusada", m);
  m = await falha("INSERT INTO SetoresTecnicosAdesoes (VinculoId, MembroId, SetorId, Forma, DataAceite) VALUES (@v, 5002, @s, 'LISTA_OURO', '2026-10-01')", { v: v2, s: setores.TRANSPORTE }); ok(m && /CK_SetoresAdesoes_Forma/.test(m), "Lista de Ouro não é forma deste Termo", m);
  await q("INSERT INTO SetoresTecnicosAdesoes (VinculoId, MembroId, SetorId, Forma, TermoVersao, TermoHash, TermoEspecificos, DataAceite, AceitoEm, EnderecoIp, CadeiaCabecalhos) VALUES (@v, 5002, @s, 'CLICKWRAP', 1, @h, N'', '2026-10-01', SYSUTCDATETIME(), N'177.8.9.10', N'x')", { v: v2, s: setores.TRANSPORTE, h: "a".repeat(64) });
  const ad = await escalar("SELECT AdesaoId FROM SetoresTecnicosAdesoes WHERE VinculoId = @v", { v: v2 });
  m = await falha("DELETE FROM SetoresTecnicosAdesoes WHERE AdesaoId = @a", { a: ad }); ok(m && /prova documental/.test(m), "adesão não se apaga", m);
  m = await falha("UPDATE SetoresTecnicosAdesoes SET TermoHash = @h WHERE AdesaoId = @a", { a: ad, h: "b".repeat(64) }); ok(m && /prova documental/.test(m), "hash da adesão não muda", m);
  m = await falha("UPDATE SetoresTecnicosAdesoes SET EnderecoIp = N'1.2.3.4' WHERE AdesaoId = @a", { a: ad }); ok(m && /prova documental/.test(m), "o IP não é trocado por outro valor", m);
  m = await falha("INSERT INTO SetoresTecnicosAdesoes (VinculoId, MembroId, SetorId, Forma, DataAceite, Referencia, RegistradoPorMembroId) VALUES (@v, 5002, @s, 'FICHA_FISICA', '2026-10-01', N'x', 1001)", { v: v2, s: setores.TRANSPORTE }); ok(m && /UQ_SetoresAdesoes_Vinculo/.test(m), "uma adesão por vínculo", m);
  m = await falha("UPDATE SetoresTecnicosAdesoes SET EnderecoIp = N'anonimizado', CadeiaCabecalhos = NULL WHERE AdesaoId = @a", { a: ad }); ok(m === null, "a anonimização do IP é a única mudança admitida", m);
  m = await falha("UPDATE SetoresTecnicosAdesoes SET EnderecoIp = N'177.1.1.1' WHERE AdesaoId = @a", { a: ad }); ok(m && /prova documental/.test(m), "depois de anonimizado o IP não volta", m);
  // ato
  const v3 = (await q("INSERT INTO SetoresTecnicosMembros (SetorId, MembroId, Status, Origem, Formacao, CriadoPorMembroId, AtivadoEm) VALUES (@s, 5003, 'ATIVO', 'INDICACAO', N'Teste', 1001, SYSUTCDATETIME()); SELECT CAST(SCOPE_IDENTITY() AS INT) AS id", { s: setores.ENGENHARIA }))[0].id;
  const novoAto = (extra) => q(`INSERT INTO SetoresTecnicosIntervencoes (Tipo, SetorId, VinculoId, EmitidaPorMembroId, CongregacaoId, Motivo, Descricao, Status ${extra.cols || ""}) VALUES (@t, @s, @v, 5003, @c, @mo, N'justificativa', @st ${extra.vals || ""}); SELECT CAST(SCOPE_IDENTITY() AS INT) AS id`,
    { t: "INTERDICAO", s: setores.ENGENHARIA, v: v3, c: cong.central.id, mo: "RISCO_DESABAMENTO", st: "EMITIDA", ...(extra.p || {}) });
  m = await falha("INSERT INTO SetoresTecnicosIntervencoes (Tipo, SetorId, VinculoId, EmitidaPorMembroId, CongregacaoId, Motivo, Descricao, Status) VALUES ('INTERDICAO', @s, @v, 5003, @c, 'ERRO_GROSSEIRO', N'x', 'EMITIDA')", { s: setores.ENGENHARIA, v: v3, c: cong.central.id }); ok(m && /CK_SetoresInterv_Motivo/.test(m), "motivo de remoção não vale para interdição", m);
  m = await falha("INSERT INTO SetoresTecnicosIntervencoes (Tipo, SetorId, VinculoId, EmitidaPorMembroId, CongregacaoId, Motivo, Descricao, Status) VALUES ('INTERDICAO', @s, @v, 5003, @c, 'RISCO_DESABAMENTO', N'x', 'ATENDIDA')", { s: setores.ENGENHARIA, v: v3, c: cong.central.id }); ok(m && /CK_SetoresInterv_StatusDoTipo/.test(m), "ATENDIDA não existe para interdição", m);
  m = await falha("INSERT INTO SetoresTecnicosIntervencoes (Tipo, SetorId, VinculoId, EmitidaPorMembroId, CongregacaoId, Motivo, Descricao, Status, DecididaPorMembroId, DecididaEm) VALUES ('INTERDICAO', @s, @v, 5003, @c, 'RISCO_DESABAMENTO', N'x', 'EMITIDA', 1001, SYSUTCDATETIME())", { s: setores.ENGENHARIA, v: v3, c: cong.central.id }); ok(m && /CK_SetoresInterv_Decisao/.test(m), "ato EMITIDA não nasce já decidido", m);
  m = await falha("INSERT INTO SetoresTecnicosIntervencoes (Tipo, SetorId, VinculoId, EmitidaPorMembroId, CongregacaoId, Motivo, Descricao, Status) VALUES ('INTERDICAO', @s, @v, 5003, @c, 'RISCO_DESABAMENTO', N'x', 'RATIFICADA')", { s: setores.ENGENHARIA, v: v3, c: cong.central.id }); ok(m && /CK_SetoresInterv_Decisao/.test(m), "ratificada exige quem e quando", m);
  m = await falha("INSERT INTO SetoresTecnicosIntervencoes (Tipo, SetorId, VinculoId, EmitidaPorMembroId, CongregacaoId, Motivo, Descricao, Status, DecididaPorMembroId, DecididaEm) VALUES ('INTERDICAO', @s, @v, 5003, @c, 'RISCO_DESABAMENTO', N'x', 'REVOGADA', 1001, SYSUTCDATETIME())", { s: setores.ENGENHARIA, v: v3, c: cong.central.id }); ok(m && /CK_SetoresInterv_Revogacao/.test(m), "revogada exige o motivo", m);
  m = await falha("INSERT INTO SetoresTecnicosIntervencoes (Tipo, SetorId, VinculoId, EmitidaPorMembroId, CongregacaoId, Motivo, Descricao, Status) VALUES ('INTERDICAO', @s, @v, 5003, @c, 'RISCO_DESABAMENTO', N'x', 'LEVANTADA')", { s: setores.ENGENHARIA, v: v3, c: cong.central.id }); ok(m && /CK_SetoresInterv_Fechamento/.test(m), "levantada exige quem, quando e observação", m);
  m = await falha("INSERT INTO SetoresTecnicosIntervencoes (Tipo, SetorId, VinculoId, EmitidaPorMembroId, CongregacaoId, CanalId, Motivo, Descricao, Status) VALUES ('INTERDICAO', @s, @v, 5003, @c, @ca, 'RISCO_DESABAMENTO', N'x', 'EMITIDA')", { s: setores.ENGENHARIA, v: v3, c: cong.central.id, ca: canalId }); ok(m && /CK_SetoresInterv_Canal/.test(m), "interdição não leva canal", m);
  const aId = (await novoAto({}))[0].id;
  m = await falha("DELETE FROM SetoresTecnicosIntervencoes WHERE IntervencaoId = @i", { i: aId }); ok(m && /não se apaga/.test(m), "ato cautelar não se apaga", m);
  m = await falha("UPDATE SetoresTecnicosIntervencoes SET Descricao = N'outra' WHERE IntervencaoId = @i", { i: aId }); ok(m && /não pode ser reescrito/.test(m), "a justificativa do ato não é reescrita", m);
  m = await falha("UPDATE SetoresTecnicosIntervencoes SET EmitidaPorMembroId = 2002 WHERE IntervencaoId = @i", { i: aId }); ok(m && /não pode ser reescrito/.test(m), "quem emitiu não muda", m);
  await q("UPDATE SetoresTecnicosIntervencoes SET Status = 'REVOGADA', DecididaPorMembroId = 1001, DecididaEm = SYSUTCDATETIME(), DecisaoObs = N'não há risco' WHERE IntervencaoId = @i", { i: aId });
  m = await falha("UPDATE SetoresTecnicosIntervencoes SET Status = 'EMITIDA', DecididaPorMembroId = NULL, DecididaEm = NULL, DecisaoObs = NULL WHERE IntervencaoId = @i", { i: aId }); ok(m && /definitivo/.test(m), "ato revogado é definitivo", m);
  // vistoria
  const vv = (await q("INSERT INTO VistoriasAntecedentes (MembroId, Motivo, Funcao, DataVerificacao, Resultado, Parecer, DestinoOriginal, AssinadaPorMembroId) VALUES (5004, 'INVESTIDURA', N'Função', '2026-10-01', 'SEM_RESTRICAO', N'Sem apontamentos.', 'DEVOLVIDO', 1001); SELECT CAST(SCOPE_IDENTITY() AS INT) AS id"))[0].id;
  m = await falha("UPDATE VistoriasAntecedentes SET Parecer = N'outro' WHERE VistoriaId = @v", { v: vv }); ok(m && /não se altera nem se apaga/.test(m), "o Termo de Vistoria não se altera", m);
  m = await falha("DELETE FROM VistoriasAntecedentes WHERE VistoriaId = @v", { v: vv }); ok(m && /não se altera nem se apaga/.test(m), "o Termo de Vistoria não se apaga", m);
  m = await falha("INSERT INTO VistoriasAntecedentes (MembroId, Motivo, Funcao, DataVerificacao, Resultado, Parecer, DestinoOriginal, AssinadaPorMembroId) VALUES (5004, 'INVESTIDURA', N'Função', '2026-10-01', 'SEM_RESTRICAO', N'Sem apontamentos.', 'DEVOLVIDO', 5004)"); ok(m && /CK_Vistorias_NaoAutoassina/.test(m), "ninguém assina a própria vistoria (banco)", m);
  m = await falha("INSERT INTO VistoriasAntecedentes (MembroId, Motivo, Funcao, DataVerificacao, Resultado, Parecer, AssinadaPorMembroId) VALUES (5004, 'INVESTIDURA', N'Função', '2026-10-01', 'SEM_RESTRICAO', N'Sem apontamentos.', 1001)"); ok(m && /CK_Vistorias_Original/.test(m), "sem recusa, o destino do original é obrigatório (banco)", m);
  m = await falha("INSERT INTO VistoriasAntecedentes (MembroId, Motivo, Funcao, DataVerificacao, Resultado, Parecer, DestinoOriginal, AssinadaPorMembroId) VALUES (5004, 'INVESTIDURA', N'Função', '2026-10-01', 'RECUSA', N'Recusou.', 'DEVOLVIDO', 1001)"); ok(m && /CK_Vistorias_Original/.test(m), "na recusa não há original (banco)", m);
  for (const h of ["A".repeat(64), "a".repeat(63), "g".repeat(64), "0x" + "a".repeat(62)]) {
    m = await falha("INSERT INTO VistoriasDocumentos (VistoriaId, Tipo, HashSha256, DataEmissao) VALUES (@v, 'OUTRO', @h, '2026-10-01')", { v: vv, h }); ok(m && /CK_VistoriasDoc_Hash/.test(m), `hash inválido recusado pelo banco (${h.slice(0, 6)}…${h.length})`, m);
  }
  await q("INSERT INTO VistoriasDocumentos (VistoriaId, Tipo, HashSha256, DataEmissao) VALUES (@v, 'OUTRO', @h, '2026-10-01')", { v: vv, h: "0123456789abcdef".repeat(4) });
  ok(true, "hash SHA-256 em minúsculas é aceito");
  m = await falha("UPDATE VistoriasDocumentos SET Tipo = 'OUTRO' WHERE VistoriaId = @v", { v: vv }); ok(m && /não se altera nem se apaga/.test(m), "o hash da certidão não se altera", m);
  m = await falha("DELETE FROM VistoriasDocumentos WHERE VistoriaId = @v", { v: vv }); ok(m && /não se altera nem se apaga/.test(m), "o hash da certidão não se apaga", m);
  // A anulação do Termo de Vistoria (só de acréscimo): uma por vistoria, sem alterar nem apagar, com motivo e quem anulou.
  const vv2 = (await q("INSERT INTO VistoriasAntecedentes (MembroId, Motivo, Funcao, DataVerificacao, Resultado, Parecer, DestinoOriginal, AssinadaPorMembroId) VALUES (5003, 'INVESTIDURA', N'Função', '2026-10-01', 'SEM_RESTRICAO', N'Matrícula errada.', 'DEVOLVIDO', 1001); SELECT CAST(SCOPE_IDENTITY() AS INT) AS id"))[0].id;
  await q("INSERT INTO VistoriasAnulacoes (VistoriaId, Motivo, AnuladaPorMembroId) VALUES (@v, N'Termo lavrado na matrícula errada.', 1001)", { v: vv2 });
  ok(true, "a anulação do Termo de Vistoria é gravada à parte");
  m = await falha("INSERT INTO VistoriasAnulacoes (VistoriaId, Motivo, AnuladaPorMembroId) VALUES (@v, N'De novo.', 1001)", { v: vv2 }); ok(m && /UQ_VistoriasAnulacoes_Vistoria/.test(m), "uma vistoria só se anula uma vez (banco)", m);
  m = await falha("UPDATE VistoriasAnulacoes SET Motivo = N'outro' WHERE VistoriaId = @v", { v: vv2 }); ok(m && /não se altera nem se apaga/.test(m), "a anulação não se altera", m);
  m = await falha("DELETE FROM VistoriasAnulacoes WHERE VistoriaId = @v", { v: vv2 }); ok(m && /não se altera nem se apaga/.test(m), "a anulação não se apaga (a vistoria anulada não volta)", m);
  m = await falha("DELETE FROM VistoriasAntecedentes WHERE VistoriaId = @v", { v: vv2 }); ok(m && /não se altera nem se apaga|REFERENCE constraint/.test(m), "a vistoria anulada também não se apaga (a chave estrangeira da anulação a segura)", m);
  // limpa as linhas de teste do gatilho para não atrapalhar os roteiros seguintes (o ato revogado, a vistoria e os vínculos 2001/2012 são do teste)
  fim("e2e-1-setup");
})().catch((e) => { console.error("ERRO:", e); process.exitCode = 1; try { require("./lib").shimEncerrar(); } catch { } });
