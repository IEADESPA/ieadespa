-- ============================================================
-- Migração 016 — Catálogo de Status do Membro (configurável).
--
-- O campo `MembroReferencia.Status` (ATIVO / LICENÇA / INATIVO / DESLIGADO)
-- nasceu fixo em código (select hardcoded no front). Aqui ele vira catálogo,
-- no mesmo espírito de `SituacoesMembro` (v0.1): a Secretaria pode criar,
-- renomear e inativar status via `GestaoCatalogos`, sem mexer em código.
--
-- Importante: o código continua dependendo dos valores semânticos "ATIVO"
-- (fallback de comunhão na elegibilidade) e "DESLIGADO" (fluxo de desligar
-- pessoa), por isso eles são SEMEADOS aqui e não devem ser removidos/renomeados
-- — o catálogo serve para exibição, ordenação do seletor e inclusão de novos
-- status (ex.: FALECIDO na v1.5/v1.6), não para alterar a regra jurídica.
--
-- Idempotente: seguro para reexecutar sem apagar dados.
-- ============================================================

IF NOT EXISTS (SELECT 1 FROM sys.objects WHERE object_id = OBJECT_ID(N'dbo.StatusMembro') AND type = N'U')
BEGIN
    CREATE TABLE dbo.StatusMembro (
        StatusId  INT IDENTITY PRIMARY KEY,
        Sigla     NVARCHAR(30) NOT NULL,
        Nome      NVARCHAR(100) NOT NULL,
        Ativa     BIT NOT NULL DEFAULT 1
    );
END
GO

INSERT INTO dbo.StatusMembro (Sigla, Nome)
SELECT v.Sigla, v.Nome FROM (VALUES
    ('ATIVO','ATIVO'),
    ('LICENÇA','LICENÇA'),
    ('INATIVO','INATIVO'),
    ('DESLIGADO','DESLIGADO')
) AS v(Sigla, Nome)
WHERE NOT EXISTS (SELECT 1 FROM dbo.StatusMembro s WHERE s.Sigla = v.Sigla);
GO
