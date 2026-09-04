-- ============================================================
-- Migração 022 — Cadastro Ampliado (v1.7): Foto do membro (com consentimento como
-- trava real, não só registro paralelo) e Responsável Legal em Vínculos Familiares
-- (base pro cadastro de menores, 0-17).
--
-- Dados de saúde (PSC) e Profissão ficaram FORA do escopo (ver README v1.7): PSC é
-- o Programa de Saúde Congregacional — avaliação institucional da congregação
-- (Regimento Art. 127-129, FASE 7/v7.1), não dado de saúde individual; não há artigo
-- exigindo coleta de dado de saúde de pessoa. Vínculos de departamento/congregação/
-- cargo/função já estão cobertos pelo que existe (Departamento 1:1 + Órgãos/Assentos
-- N:N) — sem mudança de schema.
--
-- Idempotente: seguro para reexecutar sem apagar dados.
-- ============================================================

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.MembroReferencia') AND name = N'FotoUrl')
    ALTER TABLE dbo.MembroReferencia ADD FotoUrl NVARCHAR(500) NULL;
GO

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.VinculosFamiliares') AND name = N'ResponsavelLegal')
    ALTER TABLE dbo.VinculosFamiliares ADD ResponsavelLegal BIT NOT NULL DEFAULT 0;
GO
