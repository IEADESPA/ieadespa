-- ============================================================
-- Migração 039 — v3.6: Escada Territorial de Instâncias Disciplinares
-- (JAI -> JEA -> TER -> homologação do CEI). Reaproveita o motor de
-- Processo Disciplinar (v3.2-v3.5) permitindo abrir processo num órgão
-- territorial (OrgaosLocais) além dos 5 órgãos centrais (Orgaos).
-- ============================================================

-- Corrige o nome errado semeado na migração 007 — o Regimento (Art. 105)
-- chama o órgão de Congregação de "Junta de Articulação Institucional",
-- nunca "Junta Administrativa da Igreja".
UPDATE dbo.OrgaosLocais
SET Nome = REPLACE(Nome, 'Junta Administrativa da Igreja', 'Junta de Articulação Institucional')
WHERE Sigla = 'JAI' AND Nome LIKE 'Junta Administrativa da Igreja%';
GO

IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.ProcessosDisciplinares') AND name = N'OrgaoResponsavelId' AND is_nullable = 0)
    ALTER TABLE dbo.ProcessosDisciplinares ALTER COLUMN OrgaoResponsavelId INT NULL;
GO

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.ProcessosDisciplinares') AND name = N'OrgaoLocalId')
    ALTER TABLE dbo.ProcessosDisciplinares ADD OrgaoLocalId INT NULL REFERENCES dbo.OrgaosLocais(OrgaoLocalId);
GO
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.ProcessosDisciplinares') AND name = N'ProcessoOrigemId')
    ALTER TABLE dbo.ProcessosDisciplinares ADD ProcessoOrigemId INT NULL REFERENCES dbo.ProcessosDisciplinares(ProcessoId);
GO
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.ProcessosDisciplinares') AND name = N'HomologadoPeloCEI')
    ALTER TABLE dbo.ProcessosDisciplinares ADD HomologadoPeloCEI BIT NULL; -- NULL = não se aplica, 0 = pendente, 1 = homologado
GO
