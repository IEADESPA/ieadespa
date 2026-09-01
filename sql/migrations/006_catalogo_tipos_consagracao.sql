-- ============================================================
-- Migração 006 — Catálogo configurável de Tipos de Proposta (Consagrações)
-- Antes, o "Assunto" da tela de Consagrações era uma lista fixa no HTML
-- (Integração, Reintegração, Separação ao Diaconato, etc.) — impossível
-- adicionar/remover um tipo sem mexer em código. Vira catálogo, igual
-- Departamentos/Situações (CRUD via GestaoCatalogos).
-- Idempotente: seguro para reexecutar sem apagar dados.
-- ============================================================

IF NOT EXISTS (SELECT 1 FROM sys.objects WHERE object_id = OBJECT_ID(N'dbo.TiposConsagracao') AND type = N'U')
BEGIN
    CREATE TABLE dbo.TiposConsagracao (
        TipoConsagracaoId INT IDENTITY PRIMARY KEY,
        Nome              NVARCHAR(100) NOT NULL,
        Ativo             BIT NOT NULL DEFAULT 1
    );
END
GO

INSERT INTO dbo.TiposConsagracao (Nome)
SELECT v.Nome FROM (VALUES
    ('Integração'),
    ('Reintegração'),
    ('Separação ao Diaconato'),
    ('Consagração a Presbítero'),
    ('Consagração a Evangelista')
) AS v(Nome)
WHERE NOT EXISTS (SELECT 1 FROM dbo.TiposConsagracao t WHERE t.Nome = v.Nome);
GO
