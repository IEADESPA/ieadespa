-- ============================================================
-- Migração 041 — v3.6.2: Reuniões passam a aceitar órgão territorial
-- (OrgaosLocais) além dos 5 órgãos centrais, e Papéis novos dão acesso
-- (Lideranca Papel+Escopo) a quem é membro de JEA/JUC/CRA/TER/CRAF/CEQ/
-- CAQ/CDE (JAI já usava o papel "Dirigente de Congregação" existente,
-- mas ganha também um papel próprio pra membros extras — Art. 106).
-- ============================================================

IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.Sessoes') AND name = N'OrgaoId' AND is_nullable = 0)
    ALTER TABLE dbo.Sessoes ALTER COLUMN OrgaoId INT NULL;
GO
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.Sessoes') AND name = N'OrgaoLocalId')
    ALTER TABLE dbo.Sessoes ADD OrgaoLocalId INT NULL REFERENCES dbo.OrgaosLocais(OrgaoLocalId);
GO

-- Papéis territoriais — Nivel = EscopoTipo esperado na Lideranca. JAI/JEA/TER/
-- CDE são judiciário (Art. 95 §1º/103) e ganham "disciplina"; CRA/CRAF/CEQ/
-- CAQ/JUC são administrativo/fiscal e ganham só "reunioes".
IF NOT EXISTS (SELECT 1 FROM dbo.Papeis WHERE Nome = 'Membro da JAI')
    INSERT INTO dbo.Papeis (Nome, Nivel, Permissoes) VALUES ('Membro da JAI', 'CONGREGACAO', 'reunioes,disciplina');
GO
IF NOT EXISTS (SELECT 1 FROM dbo.Papeis WHERE Nome = 'Membro da JEA')
    INSERT INTO dbo.Papeis (Nome, Nivel, Permissoes) VALUES ('Membro da JEA', 'AREA', 'reunioes,disciplina');
GO
IF NOT EXISTS (SELECT 1 FROM dbo.Papeis WHERE Nome = 'Membro da JUC')
    INSERT INTO dbo.Papeis (Nome, Nivel, Permissoes) VALUES ('Membro da JUC', 'AREA', 'reunioes');
GO
IF NOT EXISTS (SELECT 1 FROM dbo.Papeis WHERE Nome = 'Membro do CRA')
    INSERT INTO dbo.Papeis (Nome, Nivel, Permissoes) VALUES ('Membro do CRA', 'REGIAO', 'reunioes');
GO
IF NOT EXISTS (SELECT 1 FROM dbo.Papeis WHERE Nome = 'Membro do TER')
    INSERT INTO dbo.Papeis (Nome, Nivel, Permissoes) VALUES ('Membro do TER', 'REGIAO', 'reunioes,disciplina');
GO
IF NOT EXISTS (SELECT 1 FROM dbo.Papeis WHERE Nome = 'Membro do CRAF')
    INSERT INTO dbo.Papeis (Nome, Nivel, Permissoes) VALUES ('Membro do CRAF', 'REGIAO', 'reunioes');
GO
IF NOT EXISTS (SELECT 1 FROM dbo.Papeis WHERE Nome = 'Membro do CEQ')
    INSERT INTO dbo.Papeis (Nome, Nivel, Permissoes) VALUES ('Membro do CEQ', 'QUADRANTE', 'reunioes');
GO
IF NOT EXISTS (SELECT 1 FROM dbo.Papeis WHERE Nome = 'Membro do CAQ')
    INSERT INTO dbo.Papeis (Nome, Nivel, Permissoes) VALUES ('Membro do CAQ', 'QUADRANTE', 'reunioes');
GO
IF NOT EXISTS (SELECT 1 FROM dbo.Papeis WHERE Nome = 'Membro do CDE')
    INSERT INTO dbo.Papeis (Nome, Nivel, Permissoes) VALUES ('Membro do CDE', 'DISTRITO', 'reunioes,disciplina');
GO
