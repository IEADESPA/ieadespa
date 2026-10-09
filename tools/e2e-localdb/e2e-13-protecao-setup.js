// e2e-13-protecao-setup.js — v7.8 (Incidentes, notificação obrigatória e escuta protegida): as garantias da migração 144 (esquema, CHECK, gatilhos, índices, permissão, papel
// do Comitê, avisos, retenção, idempotência) e o cenário dos roteiros e2e-14 a e2e-16, sobre a base da v7.7 (cenario-menores).
// Os registros de teste dos gatilhos são APAGADOS no fim (com os gatilhos desligados só durante a limpeza), para a base salva sair limpa.
const fs = require("fs");
const L = require("./lib");
const { q, escalar, ok, fim, API, path, obterPool } = L;
const cen = JSON.parse(fs.readFileSync(path.join(__dirname, "cenario.json"), "utf8"));
const falha = async (texto, params) => { try { await q(texto, params); return null; } catch (e) { return String(e.message || e); } };

(async () => {
  console.log("== migração 144: esquema, permissão, papel do Comitê, avisos, retenção ==");
  for (const t of ["IncidentesProtecao", "IncidenteEnvolvidos", "IncidenteDecisoesCautelares", "IncidenteRelatos", "IncidenteLeituras", "IncidenteComunicacoes", "IncidenteReclassificacoes"]) {
    ok((await escalar("SELECT COUNT(*) FROM sys.tables WHERE name = @t", { t })) === 1, `tabela ${t} existe`);
  }
  for (const g of ["TR_IncidentesProtecao_Protegido", "TR_IncidenteEnvolvidos_Imutavel", "TR_IncidenteDecisoes_Imutavel", "TR_IncidenteRelatos_Imutavel", "TR_IncidenteLeituras_Imutavel", "TR_IncidenteComunicacoes_Imutavel", "TR_IncidenteReclass_Imutavel"]) {
    ok((await escalar("SELECT COUNT(*) FROM sys.triggers WHERE name = @t", { t: g })) === 1, `gatilho ${g} existe`);
  }
  ok((await escalar("SELECT COUNT(*) FROM sys.indexes WHERE name = 'UX_IncidenteRelatos_Um'")) === 1, "índice único: um relato por incidente");
  ok((await escalar("SELECT COUNT(*) FROM Funcionalidades WHERE Chave = 'protecao_menores'")) === 1, "a permissão protecao_menores existe");
  for (const p of ["Presidente", "Secretário Geral", "Dirigente de Congregação", "Comitê de Proteção"]) {
    ok((await escalar("SELECT COUNT(*) FROM Papeis WHERE Nome = @n AND (',' + Permissoes + ',') LIKE '%,protecao_menores,%'", { n: p })) === 1, `o papel ${p} tem a permissão`);
  }
  ok((await escalar("SELECT Nivel FROM Papeis WHERE Nome = N'Comitê de Proteção'")) === "GLOBAL", "o Comitê de Proteção é papel de nível geral");
  ok((await escalar("SELECT COUNT(*) FROM NotificacaoRegras WHERE Chave LIKE 'PROTECAO[_]%'")) === 6, "6 regras de aviso da proteção");
  ok((await escalar("SELECT COUNT(*) FROM NotificacaoRegras WHERE Chave LIKE 'PROTECAO[_]%' AND Obrigatoria = 1 AND CanalEmail = 1")) === 6, "todas obrigatórias e por e-mail (ninguém desliga o que protege criança)");
  ok((await escalar("SELECT COUNT(*) FROM PoliticasRetencao WHERE Categoria = N'Incidentes de proteção de crianças e adolescentes' AND DiasRetencao = 7300 AND LEN(BaseLegal) BETWEEN 100 AND 300")) === 1, "a política de retenção (20 anos) está lá e cabe na coluna");
  // idempotência: reaplicar a 144 sobre o banco já migrado não duplica nada nem derruba
  const sqlTexto = fs.readFileSync(path.join(API, "../sql/migrations/144_incidentes_protecao.sql"), "utf8");
  const pool = await obterPool();
  for (let i = 0; i < 2; i++) for (const lote of sqlTexto.split(/^\s*GO\s*$/gim).map((t) => t.trim()).filter(Boolean)) await pool.request().query(lote);
  ok((await escalar("SELECT COUNT(*) FROM NotificacaoRegras WHERE Chave LIKE 'PROTECAO[_]%'")) === 6, "reaplicar duas vezes não duplica as regras de aviso");
  ok((await escalar("SELECT COUNT(*) FROM Papeis WHERE Nome = N'Comitê de Proteção'")) === 1, "nem o papel do Comitê");
  ok((await escalar("SELECT LEN(Permissoes) - LEN(REPLACE(Permissoes, 'protecao_menores', '')) FROM Papeis WHERE Nome = 'Presidente'")) === 'protecao_menores'.length, "nem repete a permissão no Presidente");

  console.log("== CHECK e gatilhos da 144 ==");
  const c1 = cen.cong.central.id, c3 = cen.cong.beta.id;
  const incidente = (extra = {}) => ({ p: `PRO-T-${Math.random().toString(36).slice(2, 10)}`, n: "QUEBRA_POLITICA", o: "MEMBRO", c: c3, ...extra });
  const insIncidente = (d, tipo = "QUEBRA") => q(`INSERT INTO IncidentesProtecao (Protocolo, Nivel, Origem, CongregacaoId, DataOcorrencia, Descricao, ConhecidoEm, ExigeComunicacao, PrazoNotificacaoEm, RegistradoPorMembroId, RelatadoPor)
    VALUES (@p, @n, @o, @c, '2026-10-01', N'Descrição de teste do incidente.', SYSUTCDATETIME(), ${d.x ? 1 : 0}, ${d.x ? "DATEADD(HOUR, 24, SYSUTCDATETIME())" : "NULL"}, ${d.semRegistrante ? "NULL" : "3001"}, ${d.rp ? `N'${d.rp}'` : "NULL"}); SELECT CAST(SCOPE_IDENTITY() AS INT) AS id`, d);
  let m;
  m = await falha(`INSERT INTO IncidentesProtecao (Protocolo, Nivel, Origem, CongregacaoId, DataOcorrencia, Descricao, ConhecidoEm, ExigeComunicacao, RegistradoPorMembroId) VALUES (@p, 'ALEGACAO', 'MEMBRO', @c, '2026-10-01', N'x teste', SYSUTCDATETIME(), 0, 3001)`, incidente());
  ok(m && /CK_IncidentesProtecao_Exige|CK_IncidentesProtecao_Prazo|CK_IncidentesProtecao_QuemContou/.test(m), "suspeita de violência sem prazo de 24 horas é recusada", m);
  m = await falha(`INSERT INTO IncidentesProtecao (Protocolo, Nivel, Origem, CongregacaoId, DataOcorrencia, Descricao, ConhecidoEm, ExigeComunicacao, PrazoNotificacaoEm, RegistradoPorMembroId) VALUES (@p, 'ALEGACAO', 'MEMBRO', @c, '2026-10-01', N'x teste', SYSUTCDATETIME(), 1, DATEADD(HOUR, 24, SYSUTCDATETIME()), 3001)`, incidente());
  ok(m && /CK_IncidentesProtecao_QuemContou/.test(m), "suspeita de violência sem dizer quem contou é recusada", m);
  m = await falha(`INSERT INTO IncidentesProtecao (Protocolo, Nivel, Origem, CongregacaoId, DataOcorrencia, Descricao, ConhecidoEm, ExigeComunicacao) VALUES (@p, 'QUEBRA_POLITICA', 'MEMBRO', @c, '2026-10-01', N'x teste', SYSUTCDATETIME(), 0)`, incidente());
  ok(m && /CK_IncidentesProtecao_Registrante/.test(m), "incidente de membro sem registrante é recusado", m);
  m = await falha(`INSERT INTO IncidentesProtecao (Protocolo, Nivel, Origem, DataOcorrencia, Descricao, ConhecidoEm, ExigeComunicacao) VALUES (@p, 'TALVEZ', 'MEMBRO', '2026-10-01', N'x teste', SYSUTCDATETIME(), 0)`, incidente());
  ok(m && /CK_IncidentesProtecao_Nivel/.test(m), "nível fora da lista é recusado", m);

  const quebra = (await insIncidente(incidente()))[0].id;
  const outro = incidente();
  const protocoloRepetido = await escalar("SELECT Protocolo FROM IncidentesProtecao WHERE IncidenteId = @i", { i: quebra });
  m = await falha(`INSERT INTO IncidentesProtecao (Protocolo, Nivel, Origem, CongregacaoId, DataOcorrencia, Descricao, ConhecidoEm, ExigeComunicacao, RegistradoPorMembroId) VALUES (@p, 'QUEBRA_POLITICA', 'MEMBRO', @c, '2026-10-01', N'x teste', SYSUTCDATETIME(), 0, 3001)`, { ...outro, p: protocoloRepetido });
  ok(m && /UQ_IncidentesProtecao_Protocolo/.test(m), "o protocolo é único", m);
  m = await falha("UPDATE IncidentesProtecao SET Descricao = N'outra coisa' WHERE IncidenteId = @i", { i: quebra }); ok(m && /registro documental/.test(m), "a descrição do fato não se altera", m);
  m = await falha("UPDATE IncidentesProtecao SET ConhecidoEm = DATEADD(DAY, 1, ConhecidoEm) WHERE IncidenteId = @i", { i: quebra }); ok(m && /registro documental/.test(m), "o instante em que a Igreja ficou sabendo não se altera", m);
  m = await falha("UPDATE IncidentesProtecao SET CongregacaoId = @c WHERE IncidenteId = @i", { i: quebra, c: c1 }); ok(m && /registro documental/.test(m), "a congregação não se muda", m);
  m = await falha("DELETE FROM IncidentesProtecao WHERE IncidenteId = @i", { i: quebra }); ok(m && /registro documental/.test(m), "o incidente não se apaga", m);
  m = await falha("UPDATE IncidentesProtecao SET Nivel = 'QUASE_ACIDENTE' WHERE IncidenteId = @i", { i: quebra }); ok(m && /registro documental/.test(m), "o nível não desce", m);
  m = await falha("UPDATE IncidentesProtecao SET Nivel = 'ALEGACAO' WHERE IncidenteId = @i", { i: quebra }); ok(m && /CK_IncidentesProtecao_(Exige|Prazo|QuemContou)/.test(m), "subir para suspeita de violência sem o prazo e quem contou é recusado", m);
  m = await falha("UPDATE IncidentesProtecao SET Nivel = 'ALEGACAO', ExigeComunicacao = 1, PrazoNotificacaoEm = DATEADD(HOUR, 24, SYSUTCDATETIME()), RelatadoPor = 'VOLUNTARIO' WHERE IncidenteId = @i", { i: quebra }); ok(m === null, "subir de nível com prazo e quem contou é aceito", m);
  m = await falha("UPDATE IncidentesProtecao SET Nivel = 'QUEBRA_POLITICA', ExigeComunicacao = 0 WHERE IncidenteId = @i", { i: quebra }); ok(m && /registro documental|CK_IncidentesProtecao/.test(m), "uma suspeita de violência nunca é rebaixada", m);
  m = await falha("UPDATE IncidentesProtecao SET PrazoNotificacaoEm = DATEADD(DAY, 5, PrazoNotificacaoEm) WHERE IncidenteId = @i", { i: quebra }); ok(m && /registro documental/.test(m), "o prazo das 24 horas não se estica", m);
  m = await falha("UPDATE IncidentesProtecao SET RelatadoPor = 'RESPONSAVEL' WHERE IncidenteId = @i", { i: quebra }); ok(m && /registro documental/.test(m), "quem contou não se troca depois de registrado", m);
  m = await falha("UPDATE IncidentesProtecao SET Status = 'ENCERRADO' WHERE IncidenteId = @i", { i: quebra }); ok(m && /CK_IncidentesProtecao_Encerrado/.test(m), "encerrar sem quem, quando, resultado e providência é recusado", m);
  m = await falha("UPDATE IncidentesProtecao SET Status = 'ENCERRADO', EncerradoEm = SYSUTCDATETIME(), EncerradoPorMembroId = 1001, EncerramentoResultado = 'ENCAMINHADO_AUTORIDADE', EncerramentoProvidencia = N'Comunicado ao órgão.' WHERE IncidenteId = @i", { i: quebra }); ok(m === null, "encerrar com tudo é aceito", m);
  m = await falha("UPDATE IncidentesProtecao SET EncerramentoProvidencia = N'mudei' WHERE IncidenteId = @i", { i: quebra }); ok(m && /registro documental/.test(m), "depois de encerrado nada mais muda", m);

  // relatos: um por incidente; adendos à vontade; nada se altera
  const alvo = (await insIncidente(incidente({ x: true, rp: "VOLUNTARIO", n: "ALEGACAO" })))[0].id;
  await q("INSERT INTO IncidenteRelatos (IncidenteId, Tipo, Texto) VALUES (@i, 'RELATO', N'Foi assim que a criança contou.')", { i: alvo });
  m = await falha("INSERT INTO IncidenteRelatos (IncidenteId, Tipo, Texto) VALUES (@i, 'RELATO', N'Segunda vez.')", { i: alvo }); ok(m && /UX_IncidenteRelatos_Um/.test(m), "só um relato por incidente (a escuta não se repete)", m);
  m = await falha("INSERT INTO IncidenteRelatos (IncidenteId, Tipo, Texto) VALUES (@i, 'ADENDO', N'Contou mais um pouco sozinha.')", { i: alvo }); ok(m === null, "mas o adendo espontâneo entra", m);
  m = await falha("INSERT INTO IncidenteRelatos (IncidenteId, Tipo, Texto) VALUES (@i, 'OUTRO', N'x')", { i: alvo }); ok(m && /CK_IncidenteRelatos_Tipo/.test(m), "tipo de relato fora da lista é recusado", m);
  const idRelato = await escalar("SELECT MIN(RelatoId) FROM IncidenteRelatos WHERE IncidenteId = @i", { i: alvo });
  m = await falha("UPDATE IncidenteRelatos SET Texto = N'reescrito' WHERE RelatoId = @r", { r: idRelato }); ok(m && /registro documental/.test(m), "o relato não se reescreve", m);
  m = await falha("DELETE FROM IncidenteRelatos WHERE RelatoId = @r", { r: idRelato }); ok(m && /registro documental/.test(m), "nem se apaga", m);

  // envolvido, decisões, comunicações, leituras, reclassificações
  m = await falha("INSERT INTO IncidenteEnvolvidos (IncidenteId) VALUES (@i)", { i: alvo }); ok(m && /CK_IncidenteEnvolvidos_Quem/.test(m), "envolvido sem matrícula e sem nome é recusado", m);
  await q("INSERT INTO IncidenteEnvolvidos (IncidenteId, MembroId) VALUES (@i, 2001)", { i: alvo });
  const env = await escalar("SELECT MAX(EnvolvidoId) FROM IncidenteEnvolvidos");
  m = await falha("UPDATE IncidenteEnvolvidos SET MembroId = 2002 WHERE EnvolvidoId = @e", { e: env }); ok(m && /registro histórico/.test(m), "o envolvido não se troca", m);
  m = await falha("INSERT INTO IncidenteDecisoesCautelares (EnvolvidoId, Decisao, Observacao, DecididaPorMembroId) VALUES (@e, 'TALVEZ', N'x', 1001)", { e: env }); ok(m && /CK_IncidenteDecisoes_Decisao/.test(m), "decisão fora da lista é recusada", m);
  await q("INSERT INTO IncidenteDecisoesCautelares (EnvolvidoId, Decisao, Observacao, DecididaPorMembroId) VALUES (@e, 'MANTIDO_AFASTADO', N'Mantido até a apuração.', 1001)", { e: env });
  const dec = await escalar("SELECT MAX(DecisaoId) FROM IncidenteDecisoesCautelares");
  m = await falha("UPDATE IncidenteDecisoesCautelares SET Decisao = 'LIBERADO' WHERE DecisaoId = @d", { d: dec }); ok(m && /histórico/.test(m), "a decisão não se altera (para mudar, registra-se outra)", m);
  m = await falha("DELETE FROM IncidenteDecisoesCautelares WHERE DecisaoId = @d", { d: dec }); ok(m && /histórico/.test(m), "nem se apaga", m);
  m = await falha("INSERT INTO IncidenteComunicacoes (IncidenteId, Orgao, Forma, ComunicadoEm, ForaDoPrazo, RegistradoPorMembroId) VALUES (@i, 'VIZINHO', 'OFICIO', SYSUTCDATETIME(), 0, 3001)", { i: alvo }); ok(m && /CK_IncidenteComunicacoes_Orgao/.test(m), "órgão fora da lista é recusado", m);
  await q("INSERT INTO IncidenteComunicacoes (IncidenteId, Orgao, Forma, ComunicadoEm, ProtocoloExterno, ForaDoPrazo, RegistradoPorMembroId) VALUES (@i, 'CONSELHO_TUTELAR', 'OFICIO', SYSUTCDATETIME(), N'CT-1', 0, 3001)", { i: alvo });
  const com = await escalar("SELECT MAX(ComunicacaoId) FROM IncidenteComunicacoes");
  m = await falha("UPDATE IncidenteComunicacoes SET ProtocoloExterno = N'CT-2' WHERE ComunicacaoId = @c", { c: com }); ok(m && /prova documental/.test(m), "a comunicação ao órgão é prova: não se altera", m);
  m = await falha("DELETE FROM IncidenteComunicacoes WHERE ComunicacaoId = @c", { c: com }); ok(m && /prova documental/.test(m), "nem se apaga", m);
  await q("INSERT INTO IncidenteLeituras (IncidenteId, MembroId) VALUES (@i, 1001)", { i: alvo });
  m = await falha("DELETE FROM IncidenteLeituras WHERE IncidenteId = @i", { i: alvo }); ok(m && /histórico/.test(m), "o registro de quem leu o relato não se apaga", m);
  await q("INSERT INTO IncidenteReclassificacoes (IncidenteId, NivelAnterior, NivelNovo, Motivo, ReclassificadoPorMembroId) VALUES (@i, 'QUEBRA_POLITICA', 'ALEGACAO', N'Mais grave.', 1001)", { i: alvo });
  m = await falha("UPDATE IncidenteReclassificacoes SET Motivo = N'x' WHERE IncidenteId = @i", { i: alvo }); ok(m && /histórico/.test(m), "a reclassificação não se altera", m);

  console.log("== limpeza dos registros de teste (gatilhos desligados só aqui) ==");
  for (const [tabela, gatilho] of [["IncidenteReclassificacoes", "TR_IncidenteReclass_Imutavel"], ["IncidenteLeituras", "TR_IncidenteLeituras_Imutavel"], ["IncidenteComunicacoes", "TR_IncidenteComunicacoes_Imutavel"],
    ["IncidenteDecisoesCautelares", "TR_IncidenteDecisoes_Imutavel"], ["IncidenteRelatos", "TR_IncidenteRelatos_Imutavel"], ["IncidenteEnvolvidos", "TR_IncidenteEnvolvidos_Imutavel"], ["IncidentesProtecao", "TR_IncidentesProtecao_Protegido"]]) {
    await q(`DISABLE TRIGGER dbo.${gatilho} ON dbo.${tabela}; DELETE FROM dbo.${tabela}; ENABLE TRIGGER dbo.${gatilho} ON dbo.${tabela}`);
  }
  ok((await escalar("SELECT COUNT(*) FROM IncidentesProtecao")) === 0 && (await escalar("SELECT COUNT(*) FROM sys.triggers WHERE name LIKE 'TR[_]Incidente%' AND is_disabled = 1")) === 0, "base limpa e todos os gatilhos de volta ligados");

  console.log("== o cenário: o Comitê de Proteção (incompleto de propósito: 2 membros) ==");
  await q("INSERT INTO MembroReferencia (MembroId, Nome, CongregacaoId, Status, SituacaoMembro, DataNascimento, Email, CargoMinisterial) VALUES (7001, N'Pastor do Comite E2E', @c, 'ATIVO', 'EM_COMUNHAO', '1968-01-01', N'p7001@exemplo.org', 'PASTOR')", { c: c1 });
  await q("INSERT INTO MembroReferencia (MembroId, Nome, CongregacaoId, Status, SituacaoMembro, DataNascimento, Email, CargoMinisterial) VALUES (7002, N'Leiga do Comite E2E', @c, 'ATIVO', 'EM_COMUNHAO', '1985-01-01', N'p7002@exemplo.org', 'MEMBRO')", { c: c1 });
  await q("INSERT INTO MembroReferencia (MembroId, Nome, CongregacaoId, Status, SituacaoMembro, DataNascimento, Email, CargoMinisterial) VALUES (7003, N'Leigo Candidato E2E', @c, 'ATIVO', 'EM_COMUNHAO', '1990-01-01', N'p7003@exemplo.org', 'MEMBRO')", { c: c1 });
  const papelComite = await escalar("SELECT PapelId FROM Papeis WHERE Nome = N'Comitê de Proteção'");
  for (const id of [7001, 7002]) await q("INSERT INTO Lideranca (MembroId, PapelId, EscopoTipo, EscopoId) VALUES (@m, @p, 'GLOBAL', NULL)", { m: id, p: papelComite });
  fs.writeFileSync(path.join(__dirname, "cenario-protecao.json"), JSON.stringify({ papelComite, comite: [7001, 7002], candidato: 7003 }, null, 1));
  console.log("cenário da v7.8 gravado");
  fim("e2e-13-protecao-setup");
})().catch((e) => { console.error("ERRO:", e); process.exitCode = 1; try { L.shimEncerrar(); } catch { } });
