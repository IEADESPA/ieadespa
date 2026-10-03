-- ============================================================
-- Migração 121 — Visibilidade dos documentos (atas, termos, memorandos...).
--
-- Decisão do responsável pelo projeto (02/10/2026): cada documento diz para quem é.
--   PUBLICO    — qualquer pessoa vê, inclusive sem login (só o geral marca assim);
--   MEMBROS    — qualquer membro logado vê (era o comportamento de todos os documentos até aqui);
--   LIDERANCA  — só quem entrou com a senha de liderança.
-- Os documentos que já existem ficam MEMBROS: nada passa a ser público nem deixa de ser visto por acidente.
--
-- Idempotente: seguro para reexecutar sem apagar dados.
-- ============================================================

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.Documentos') AND name = N'Visibilidade')
    ALTER TABLE dbo.Documentos ADD Visibilidade NVARCHAR(10) NOT NULL CONSTRAINT DF_Documentos_Visibilidade DEFAULT 'MEMBROS';
GO

IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = N'CK_Documentos_Visibilidade' AND parent_object_id = OBJECT_ID(N'dbo.Documentos'))
    ALTER TABLE dbo.Documentos ADD CONSTRAINT CK_Documentos_Visibilidade CHECK (Visibilidade IN ('PUBLICO', 'MEMBROS', 'LIDERANCA'));
GO
