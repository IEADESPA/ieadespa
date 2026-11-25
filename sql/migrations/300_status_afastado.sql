-- ============================================================
-- Migração 300 — AFASTADO no catálogo de situações no rol (StatusMembro).
--
-- Resposta do responsável (25/11/2026): AFASTADO é situação do rol, como INATIVO e LICENÇA (o membro afastado perde também a
-- entrada de membro, que já exige ATIVO). As migrações 016, 019 e 023 não o semearam, e a ficha agora só aceita situação do
-- catálogo (GestaoPessoas). Mesmo padrão de seed do FALECIDO (019) e da LICENCA_CANDIDATURA (023).
--
-- Junto: o índice da busca da licença aberta de uma pessoa (LicencasCandidatura por MembroId e Status), que o desligamento e o
-- falecimento usam para fechar a licença na mesma transação (shared/licencaCandidatura.js).
--
-- Número 300: bem acima das faixas em construção (Membros vai até a 187, Financeiro até a 203) para não colidir.
-- Idempotente: seguro para reexecutar sem apagar dados.
-- ============================================================

IF NOT EXISTS (SELECT 1 FROM dbo.StatusMembro WHERE Sigla = N'AFASTADO')
    INSERT INTO dbo.StatusMembro (Sigla, Nome) VALUES (N'AFASTADO', N'Afastado');
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_LicencasCandidatura_MembroId_Status' AND object_id = OBJECT_ID(N'dbo.LicencasCandidatura'))
    CREATE INDEX IX_LicencasCandidatura_MembroId_Status ON dbo.LicencasCandidatura (MembroId, Status);
GO
