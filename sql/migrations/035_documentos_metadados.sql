-- ============================================================
-- Migração 035 — v2.9: metadados extras pro catálogo de Documentos
-- (Documentos já existe desde a migração 001, nunca teve endpoint próprio).
-- Idempotente: seguro para reexecutar sem apagar dados.
-- ============================================================

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.Documentos') AND name = N'Descricao')
    ALTER TABLE dbo.Documentos ADD Descricao NVARCHAR(300) NULL;
GO

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.Documentos') AND name = N'RegistradoPor')
    ALTER TABLE dbo.Documentos ADD RegistradoPor INT NULL REFERENCES dbo.MembroReferencia(MembroId);
GO
