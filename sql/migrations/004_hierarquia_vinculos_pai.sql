-- ============================================================
-- Migração 004 — Vínculos de hierarquia que faltavam no schema
-- (Areas -> Regioes, Regioes -> Quadrantes, Quadrantes -> Distritos).
-- O front (app/script.js, CATALOGOS_CFG) e a semente antiga do mock já
-- tratavam essa cadeia como parte do cadastro; só faltava a coluna real.
-- Idempotente: seguro para reexecutar sem apagar dados.
-- ============================================================

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.Areas') AND name = N'RegiaoId')
    ALTER TABLE dbo.Areas ADD RegiaoId INT NULL REFERENCES dbo.Regioes(RegiaoId);
GO

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.Regioes') AND name = N'QuadranteId')
    ALTER TABLE dbo.Regioes ADD QuadranteId INT NULL REFERENCES dbo.Quadrantes(QuadranteId);
GO

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.Quadrantes') AND name = N'DistritoId')
    ALTER TABLE dbo.Quadrantes ADD DistritoId INT NULL REFERENCES dbo.Distritos(DistritoId);
GO
