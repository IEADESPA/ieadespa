-- ============================================================
-- Migração 025 — Convocação da Assembleia Geral (v2.1).
--
-- Sessoes.TipoSessao e VinculadaSessaoId já existiam desde a migração 001, mas
-- nunca foram usados de verdade. Aqui só adiciona o que faltava pra separar
-- "Convocar" (Edital, com antecedência — Art. 20) de "Iniciar" (abrir a sessão
-- no dia previsto): DataConvocacao, DataPrevista, Pauta e MeiosDivulgacao.
-- Só a Assembleia Geral usa esses campos — os outros 4 órgãos continuam
-- abrindo reunião na hora, sem convocação prévia.
--
-- Idempotente: seguro para reexecutar sem apagar dados.
-- ============================================================

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.Sessoes') AND name = N'DataConvocacao')
    ALTER TABLE dbo.Sessoes ADD DataConvocacao DATE NULL;
GO

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.Sessoes') AND name = N'DataPrevista')
    ALTER TABLE dbo.Sessoes ADD DataPrevista DATE NULL;
GO

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.Sessoes') AND name = N'Pauta')
    ALTER TABLE dbo.Sessoes ADD Pauta NVARCHAR(1000) NULL;
GO

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.Sessoes') AND name = N'MeiosDivulgacao')
    ALTER TABLE dbo.Sessoes ADD MeiosDivulgacao NVARCHAR(300) NULL;
GO
