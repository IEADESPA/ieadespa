-- ============================================================
-- Migração 149 — v7.11.1: o mural de oração do site entra no cuidado pastoral
-- (decisão do responsável da Igreja, 21/10/2026: o pedido CONFIDENCIAL ou com SINAL DE RISCO que chega pelo mural do site não pode ficar sem aviso)
--
-- O mural do site (Directus, `mural_oracao`) é moderado pela Diretoria no painel do site, e o pedido "confidencial" ficava lá sem avisar ninguém. A partir de agora o site,
-- no mesmo instante em que recebe o pedido, manda ao sistema (servidor a servidor, com a chave combinada CHAVE_SITE_SISTEMA) os confidenciais e os que têm sinal de risco:
--   1) o pedido do site entra em PedidosOracao com Origem = 'SITE': sem congregação (o site não pergunta) e sem quem registrou (é anônimo ou só com o nome que a pessoa quis dar);
--   2) ele é SEMPRE só do nível geral (SoNivelGeral = 1) e nunca vai ao boletim (PodeBoletim = 0): o mural público é do site;
--   3) a referência do item no Directus (SiteItemId) fica guardada para a Diretoria achá-lo no painel do site.
-- Nada se apaga; o gatilho do pedido passa a proteger também a origem e a referência.
--
-- Idempotente: seguro para reexecutar sem apagar dados.
-- ============================================================

-- ---- 1) As colunas novas ----

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.PedidosOracao') AND name = N'Origem')
    ALTER TABLE dbo.PedidosOracao ADD Origem NVARCHAR(8) NOT NULL CONSTRAINT DF_PedidosOracao_Origem DEFAULT N'SISTEMA';
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.PedidosOracao') AND name = N'SiteItemId')
    ALTER TABLE dbo.PedidosOracao ADD SiteItemId INT NULL;
GO

-- ---- 2) A congregação passa a aceitar vazio (só o pedido do site) ----
-- O índice e a chave estrangeira da coluna precisam sair para mudar a nulidade; voltam logo abaixo (a chave estrangeira, agora com nome).

IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.PedidosOracao') AND name = N'CongregacaoId' AND is_nullable = 0)
BEGIN
    IF EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_PedidosOracao_Congregacao' AND object_id = OBJECT_ID(N'dbo.PedidosOracao'))
        DROP INDEX IX_PedidosOracao_Congregacao ON dbo.PedidosOracao;
    DECLARE @fk NVARCHAR(200);
    SELECT TOP 1 @fk = fk.name FROM sys.foreign_keys fk JOIN sys.foreign_key_columns fc ON fc.constraint_object_id = fk.object_id
      JOIN sys.columns c ON c.object_id = fc.parent_object_id AND c.column_id = fc.parent_column_id
      WHERE fk.parent_object_id = OBJECT_ID(N'dbo.PedidosOracao') AND c.name = N'CongregacaoId';
    IF @fk IS NOT NULL EXEC(N'ALTER TABLE dbo.PedidosOracao DROP CONSTRAINT ' + @fk);
    ALTER TABLE dbo.PedidosOracao ALTER COLUMN CongregacaoId INT NULL;
END
GO
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys fk JOIN sys.foreign_key_columns fc ON fc.constraint_object_id = fk.object_id
               JOIN sys.columns c ON c.object_id = fc.parent_object_id AND c.column_id = fc.parent_column_id
               WHERE fk.parent_object_id = OBJECT_ID(N'dbo.PedidosOracao') AND c.name = N'CongregacaoId')
    ALTER TABLE dbo.PedidosOracao ADD CONSTRAINT FK_PedidosOracao_Congregacao FOREIGN KEY (CongregacaoId) REFERENCES dbo.Congregacoes(CongregacaoId);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_PedidosOracao_Congregacao' AND object_id = OBJECT_ID(N'dbo.PedidosOracao'))
    CREATE INDEX IX_PedidosOracao_Congregacao ON dbo.PedidosOracao (CongregacaoId, Moderacao, CriadoEm DESC) INCLUDE (Risco, AnonimizadoEm, SolicitanteMembroId, SoNivelGeral);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_PedidosOracao_Origem' AND object_id = OBJECT_ID(N'dbo.PedidosOracao'))
    CREATE INDEX IX_PedidosOracao_Origem ON dbo.PedidosOracao (Origem, Moderacao, CriadoEm DESC);
GO

-- ---- 3) As regras: o pedido do sistema tem congregação e quem pediu; o do site não, e é sempre só do nível geral, fora do boletim ----

IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = N'CK_PedidosOracao_OrigemValida')
    ALTER TABLE dbo.PedidosOracao ADD CONSTRAINT CK_PedidosOracao_OrigemValida CHECK (Origem IS NOT NULL AND Origem IN (N'SISTEMA', N'SITE'));
IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = N'CK_PedidosOracao_DoSite')
    ALTER TABLE dbo.PedidosOracao ADD CONSTRAINT CK_PedidosOracao_DoSite CHECK (
        (Origem = N'SISTEMA' AND CongregacaoId IS NOT NULL AND SiteItemId IS NULL)
        OR (Origem = N'SITE' AND CongregacaoId IS NULL AND SoNivelGeral = 1 AND PodeBoletim = 0 AND SolicitanteMembroId IS NULL));
IF EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = N'CK_PedidosOracao_Quem' AND definition NOT LIKE N'%SITE%')
BEGIN
    ALTER TABLE dbo.PedidosOracao DROP CONSTRAINT CK_PedidosOracao_Quem;
    ALTER TABLE dbo.PedidosOracao ADD CONSTRAINT CK_PedidosOracao_Quem CHECK (SolicitanteMembroId IS NOT NULL OR SolicitanteNome IS NOT NULL OR AnonimizadoEm IS NOT NULL OR Origem = N'SITE');
END
IF EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = N'CK_PedidosOracao_Registrante' AND definition NOT LIKE N'%SITE%')
BEGIN
    ALTER TABLE dbo.PedidosOracao DROP CONSTRAINT CK_PedidosOracao_Registrante;
    ALTER TABLE dbo.PedidosOracao ADD CONSTRAINT CK_PedidosOracao_Registrante CHECK (RegistradoPorMembroId IS NOT NULL OR AnonimizadoEm IS NOT NULL OR Origem = N'SITE');
END
GO

-- ---- 4) O gatilho do pedido: também a origem e a referência do site não se reescrevem (a congregação, comparada com o vazio do site) ----

EXEC(N'CREATE OR ALTER TRIGGER dbo.TR_PedidosOracao_Protegido ON dbo.PedidosOracao AFTER UPDATE, DELETE AS
BEGIN
    SET NOCOUNT ON;
    IF NOT EXISTS (SELECT 1 FROM inserted)
    BEGIN
        IF EXISTS (SELECT 1 FROM deleted)
        BEGIN
            RAISERROR(N''O pedido de oração é registro do cuidado pastoral: não se apaga.'', 16, 1);
            ROLLBACK TRANSACTION;
        END
        RETURN;
    END
    IF EXISTS (SELECT 1 FROM inserted i JOIN deleted d ON d.PedidoId = i.PedidoId
        WHERE ISNULL(i.CongregacaoId, -1) <> ISNULL(d.CongregacaoId, -1) OR i.CriadoEm <> d.CriadoEm OR i.Origem <> d.Origem OR ISNULL(i.SiteItemId, -1) <> ISNULL(d.SiteItemId, -1)
           OR (ISNULL(i.RegistradoPorMembroId, -1) <> ISNULL(d.RegistradoPorMembroId, -1) AND NOT (i.AnonimizadoEm IS NOT NULL AND i.RegistradoPorMembroId IS NULL))
           OR (ISNULL(i.SolicitanteMembroId, -1) <> ISNULL(d.SolicitanteMembroId, -1) AND NOT (i.AnonimizadoEm IS NOT NULL AND i.SolicitanteMembroId IS NULL)) OR i.ParaQuem <> d.ParaQuem OR i.Categoria <> d.Categoria
           OR (i.AnonimizadoEm IS NULL AND (ISNULL(i.SolicitanteNome, N'''') <> ISNULL(d.SolicitanteNome, N'''') OR ISNULL(i.SolicitanteContato, N'''') <> ISNULL(d.SolicitanteContato, N'''')))
           OR (d.RiscoJaTeve = 1 AND i.RiscoJaTeve = 0) OR (d.SoNivelGeral = 1 AND i.SoNivelGeral = 0)
           OR (ISNULL(i.Texto, N'''') <> ISNULL(d.Texto, N'''') AND NOT (i.AnonimizadoEm IS NOT NULL AND i.Texto IS NULL))
           OR (d.AnonimizadoEm IS NOT NULL AND ISNULL(i.AnonimizadoEm, ''19000101'') <> d.AnonimizadoEm))
    BEGIN
        RAISERROR(N''O pedido de oração não se reescreve: quem pediu, quando, o assunto e o texto ficam como foram recebidos.'', 16, 1);
        ROLLBACK TRANSACTION;
    END
END');
GO
