-- ============================================================
-- Migração 003 — Torna opcionais as colunas legadas de Lideranca
-- (Tipo, Escopo). O modelo atual do app usa PapelId/EscopoTipo/EscopoId
-- (migração 002); Tipo/Escopo ficaram só de compatibilidade e nunca mais
-- são preenchidas por GestaoLideranca/LoginSecretaria, então precisam
-- deixar de ser NOT NULL para o INSERT funcionar.
-- Idempotente: seguro para reexecutar sem apagar dados.
-- ============================================================

IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.Lideranca') AND name = N'Tipo' AND is_nullable = 0)
    ALTER TABLE dbo.Lideranca ALTER COLUMN Tipo NVARCHAR(50) NULL;
GO

IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.Lideranca') AND name = N'Escopo' AND is_nullable = 0)
    ALTER TABLE dbo.Lideranca ALTER COLUMN Escopo NVARCHAR(500) NULL;
GO
