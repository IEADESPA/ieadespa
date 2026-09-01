-- ============================================================
-- Migração 009 — Vínculo do membro com Extensão da Tenda (nível 0).
--
-- Fecha a lacuna citada em api/shared/escopo.js e api/GestaoLideranca/index.js:
-- "Extensão da Tenda não entra como escopo porque MembroReferencia não tem
-- vínculo com ExtensoesTenda". Com a coluna abaixo, um membro pode ser
-- vinculado a uma Extensão (subunidade da Congregação-Mãe) e o escopo
-- "EXTENSAO" passa a valer de verdade (ver escopo.js e GestaoLideranca).
-- Idempotente: seguro para reexecutar sem apagar dados.
-- ============================================================

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.MembroReferencia') AND name = N'ExtensaoId')
    ALTER TABLE dbo.MembroReferencia ADD ExtensaoId INT NULL REFERENCES dbo.ExtensoesTenda(ExtensaoId);
GO
