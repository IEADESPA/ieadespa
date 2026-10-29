-- ============================================================
-- Migração 160 — Trava de Revisão 8-A (audita v8.1 a v8.4). Desenho e registro em docs/plano/fase-8-ministerial-afm.md.
--
--   1. ProcessosDisciplinares.CEIRecusouEm: a RECUSA da homologação pelo CEI (Art. 94, II) passa a ficar gravada. Antes ela gravava o mesmo 0 de "pendente" e a
--      decisão do TER seguia valendo para sempre (escada, CLI, credencial). Preenche a partir da auditoria ("Não homologou (CEI)").
--   2. Consagracoes.ConvencaoHomologadaEm / ConvencaoAto / ConvencaoRegistradaPor: a homologação da Convenção Estadual (CIADSETA) para Evangelista e Pastor
--      (Regimento Art. 72, V, a) — a cerimônia só recebe o candidato depois dela (também quem vem de outra convenção).
--   3. CK_Consagracoes_Encerramento: os motivos novos do processo que a vacância encerra (DISCIPLINA, LICENCA_CANDIDATURA, SAIDA_DO_ROL).
--   4. Limpeza única: quem já está fora do rol (desligado ou falecido — os status em que a vacância roda) com processo de cargo em andamento ou com CHM — o que a vacância passa a
--      fazer daqui em diante.
--   5. PoliticasRetencao: a escada e a consagração (v8.2 e v8.3) e a credencial (v8.4).
--
-- Idempotente: seguro para reexecutar sem apagar dados.
-- ============================================================

IF COL_LENGTH(N'dbo.ProcessosDisciplinares', N'CEIRecusouEm') IS NULL
    ALTER TABLE dbo.ProcessosDisciplinares ADD CEIRecusouEm DATETIME2 NULL;
GO
UPDATE pd SET CEIRecusouEm = a.Quando
FROM dbo.ProcessosDisciplinares pd
CROSS APPLY (SELECT MAX(l.DataHora) AS Quando FROM dbo.AuditLog l
             WHERE l.Tabela = N'ProcessosDisciplinares' AND l.RegistroId = pd.ProcessoId AND l.Acao = N'Não homologou (CEI)') a
WHERE pd.CEIRecusouEm IS NULL AND pd.HomologadoPeloCEI = 0 AND a.Quando IS NOT NULL;
GO

IF COL_LENGTH(N'dbo.Consagracoes', N'ConvencaoHomologadaEm') IS NULL
    ALTER TABLE dbo.Consagracoes ADD ConvencaoHomologadaEm DATE NULL, ConvencaoAto NVARCHAR(200) NULL, ConvencaoRegistradaPor INT NULL;
GO

IF EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = N'CK_Consagracoes_Encerramento' AND definition NOT LIKE N'%SAIDA_DO_ROL%')
    ALTER TABLE dbo.Consagracoes DROP CONSTRAINT CK_Consagracoes_Encerramento;
GO
IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = N'CK_Consagracoes_Encerramento')
    ALTER TABLE dbo.Consagracoes ADD CONSTRAINT CK_Consagracoes_Encerramento CHECK (
        MotivoEncerramento IS NULL OR MotivoEncerramento IN (N'INAPTO_CEI', N'AUSENCIA_CERIMONIA', N'DISCIPLINA', N'LICENCA_CANDIDATURA', N'SAIDA_DO_ROL'));
GO

-- 4. Limpeza única de quem já saiu (a mesma regra de shared/vacancia.js).
UPDATE c SET Status = N'REPROVADO', MotivoEncerramento = N'SAIDA_DO_ROL', DataConclusao = CAST(DATEADD(hour, -3, SYSUTCDATETIME()) AS date), CerimoniaId = NULL, DiplomaCodigo = NULL
FROM dbo.Consagracoes c
JOIN dbo.MembroReferencia m ON m.MembroId = c.MembroId
LEFT JOIN dbo.TiposConsagracao t ON t.Nome = c.Assunto
WHERE m.Status IN (N'DESLIGADO', N'FALECIDO')
  AND c.Status IN (N'PROTOCOLADO', N'EM_ANALISE_CONSELHO', N'AGUARDANDO_PLENARIO', N'HOMOLOGADO')
  AND ISNULL(c.CargoAlvo, t.CargoMinisterialResultante) IS NOT NULL;
GO
UPDATE ce SET RevogadoEm = SYSUTCDATETIME(), MotivoRevogacao = N'Revogado na saída do rol de membros.'
FROM dbo.CertificadosEmitidos ce
JOIN dbo.MembroReferencia m ON m.MembroId = ce.MembroId
WHERE ce.Natureza = N'CHM' AND ce.RevogadoEm IS NULL AND m.Status IN (N'DESLIGADO', N'FALECIDO');
GO
UPDATE a SET CertificadoHabilitacao = 0, CHMEm = NULL, CHMPor = NULL, CHMCertificadoId = NULL
FROM dbo.Matriculas_AFM a
JOIN dbo.MembroReferencia m ON m.MembroId = a.MembroId
WHERE a.CertificadoHabilitacao = 1 AND m.Status IN (N'DESLIGADO', N'FALECIDO');
GO

-- 5. Retenção (LGPD art. 16; Regimento Art. 132 §2º, II — a minimização do ex-membro elimina os registros de consagração).
IF NOT EXISTS (SELECT 1 FROM dbo.PoliticasRetencao WHERE Categoria = N'Escada e consagração — histórico, parecer e diplomas')
    INSERT INTO dbo.PoliticasRetencao (Categoria, BaseLegal, DiasRetencao)
    VALUES (N'Escada e consagração — histórico, parecer e diplomas', N'LGPD art. 7º, II e 11, II, d: atos exigidos pelo Regimento (Art. 66 a 75), enquanto a pessoa é membro. Na saída, a minimização elimina histórico de cargos, processos, parecer, dossiê, diploma e CHM (Regimento Art. 132 §2º, II).', NULL);
IF NOT EXISTS (SELECT 1 FROM dbo.PoliticasRetencao WHERE Categoria = N'Credencial eclesiástica — vias e verificação pública')
    INSERT INTO dbo.PoliticasRetencao (Categoria, BaseLegal, DiasRetencao)
    VALUES (N'Credencial eclesiástica — vias e verificação pública', N'LGPD art. 7º, II e 11, II, d: identificação do membro e do obreiro (Regimento Art. 76), enquanto a pessoa é membro. Na saída a credencial é recolhida (cancelada) e o QR deixa de dizer que é membro ou obreiro.', NULL);
GO
