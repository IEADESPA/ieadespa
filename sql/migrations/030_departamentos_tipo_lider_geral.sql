-- ============================================================
-- Migração 030 — v2.7 (item 2): Departamentos vs. Secretarias Adjuntas (Art. 47)
-- Distingue, dentro do mesmo catálogo Departamentos, os 4 Departamentos de
-- fato (por faixa etária/gênero) das 4 Secretarias Adjuntas (transversais) —
-- e cria o papel "Líder Geral de Departamento/Secretaria" (Nivel =
-- 'DEPARTAMENTO'), que passa a dar assento automático na CLI pelo mesmo
-- mecanismo já usado por Dirigente de Congregação (v2.7 item 1).
-- Idempotente: seguro para reexecutar sem apagar dados.
-- ============================================================

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.Departamentos') AND name = N'Tipo')
    ALTER TABLE dbo.Departamentos ADD Tipo NVARCHAR(30) NULL;
GO

UPDATE dbo.Departamentos SET Tipo = 'DEPARTAMENTO'
    WHERE Sigla IN ('UCADESPA','UMADESPA','USADESPA','UHADESPA') AND Tipo IS NULL;
GO

UPDATE dbo.Departamentos SET Tipo = 'SECRETARIA_ADJUNTA'
    WHERE Sigla IN ('EBD','FAMILIA','SEMIADESPA','ACAO_DA_FE') AND Tipo IS NULL;
GO

INSERT INTO dbo.Papeis (Nome, Nivel, Permissoes)
SELECT 'Líder Geral de Departamento/Secretaria', 'DEPARTAMENTO', 'reunioes,pessoas'
WHERE NOT EXISTS (SELECT 1 FROM dbo.Papeis WHERE Nome = 'Líder Geral de Departamento/Secretaria');
GO
