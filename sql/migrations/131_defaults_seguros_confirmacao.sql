-- ============================================================
-- Migração 131 — Defesa em profundidade no banco (5 de 5): coluna de "confirmado" nasce NÃO confirmada.
--
-- Duas colunas BIT dizem "isto já foi conferido por uma pessoa" e nasceram com DEFAULT 1 (confirmado). Um INSERT que esquecesse a coluna passava, em silêncio, por conferido.
--   * Fornecedores.DadosBancariosConfirmados (migração 052) — dado bancário confirmado libera pagamento e remessa; a rota GestaoFornecedores já grava o valor de forma explícita
--     (pendente quando há dado bancário), mas o default do banco liberaria um fornecedor inserido por outro caminho. Passa a DEFAULT 0 (pendente de confirmação).
--   * PerfisRateioDepartamental.Confirmado (migração 095) — "0 = método ainda não confirmado com a planilha real". Passa a DEFAULT 0.
-- Só troca o DEFAULT (restrição de coluna): NÃO toca em nenhuma linha existente (o valor que cada uma já tem fica como está). Verificado em todo o repositório que os únicos INSERTs
-- (GestaoFornecedores, e as migrações 095 que semeiam os perfis) informam a coluna de forma explícita, então nenhum depende do default antigo.
--
-- O nome da restrição antiga foi gerado pelo SQL Server (DF__Fornecedo__Dados__<sufixo aleatório>), por isso é descoberto no catálogo (sys.default_constraints) e não escrito aqui.
-- Trocar = remover a antiga e criar uma nova com nome fixo, dentro de UMA transação (DDL é transacional): se algo falhar, volta tudo e a coluna não fica sem default; vira só um
-- AVISO e o deploy segue. Idempotente: se o default já for 0 não faz nada.
-- ============================================================

DECLARE @nome SYSNAME, @definicao NVARCHAR(4000), @ddl NVARCHAR(400);
SELECT @nome = dc.name, @definicao = dc.definition
FROM sys.default_constraints dc
JOIN sys.columns c ON c.object_id = dc.parent_object_id AND c.column_id = dc.parent_column_id
WHERE dc.parent_object_id = OBJECT_ID(N'dbo.Fornecedores') AND c.name = N'DadosBancariosConfirmados';
IF COL_LENGTH(N'dbo.Fornecedores', N'DadosBancariosConfirmados') IS NOT NULL AND (@nome IS NULL OR @definicao NOT IN (N'((0))', N'(0)'))
BEGIN
    BEGIN TRY
        BEGIN TRANSACTION;
        IF @nome IS NOT NULL
        BEGIN
            SET @ddl = N'ALTER TABLE dbo.Fornecedores DROP CONSTRAINT ' + QUOTENAME(@nome);
            EXEC (@ddl);
        END
        ALTER TABLE dbo.Fornecedores ADD CONSTRAINT DF_Fornecedores_DadosBancariosConfirmados DEFAULT 0 FOR DadosBancariosConfirmados;
        COMMIT TRANSACTION;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        PRINT N'AVISO migração 131: default de Fornecedores.DadosBancariosConfirmados NÃO trocado para 0 — ' + ERROR_MESSAGE();
    END CATCH
END
GO

DECLARE @nome SYSNAME, @definicao NVARCHAR(4000), @ddl NVARCHAR(400);
SELECT @nome = dc.name, @definicao = dc.definition
FROM sys.default_constraints dc
JOIN sys.columns c ON c.object_id = dc.parent_object_id AND c.column_id = dc.parent_column_id
WHERE dc.parent_object_id = OBJECT_ID(N'dbo.PerfisRateioDepartamental') AND c.name = N'Confirmado';
IF COL_LENGTH(N'dbo.PerfisRateioDepartamental', N'Confirmado') IS NOT NULL AND (@nome IS NULL OR @definicao NOT IN (N'((0))', N'(0)'))
BEGIN
    BEGIN TRY
        BEGIN TRANSACTION;
        IF @nome IS NOT NULL
        BEGIN
            SET @ddl = N'ALTER TABLE dbo.PerfisRateioDepartamental DROP CONSTRAINT ' + QUOTENAME(@nome);
            EXEC (@ddl);
        END
        ALTER TABLE dbo.PerfisRateioDepartamental ADD CONSTRAINT DF_PerfisRateioDepartamental_Confirmado DEFAULT 0 FOR Confirmado;
        COMMIT TRANSACTION;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        PRINT N'AVISO migração 131: default de PerfisRateioDepartamental.Confirmado NÃO trocado para 0 — ' + ERROR_MESSAGE();
    END CATCH
END
GO
