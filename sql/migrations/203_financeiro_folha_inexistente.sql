-- ============================================================
-- Migração 203 — FASE 10, Financeiro (módulo 2), a decisão dele de 24/11/2026: a FOLHA INEXISTENTE.
--
-- A folha que a gráfica não imprimiu (o bloco devia ter 50 e veio com uma a menos) também é catalogada: a numeração não pode pular. É um tipo
-- a mais de exceção, ao lado da cancelada, da arrancada e da extraviada, com a mesma regra delas (a observação obrigatória, o desfazer só pela
-- Tesouraria Geral, a contagem no livro). No banco:
-- 1. O destino guardado ganha a palavra INEXISTENTE, com 11 letras: a coluna Destino passa de NVARCHAR(10) a NVARCHAR(12), continua obrigatória
--    (NOT NULL), em FinFolhas e em FinFolhasDesfeitas (a exceção desfeita vai inteira para lá). Aumentar o tamanho de NVARCHAR é permitido com a
--    coluna nos índices (IX_FinFolhas_Bloco e IX_FinFolhas_Saida a incluem) e nos CHECKs; nenhum dado muda.
-- 2. Os CHECKs do destino (CK_FinFolhas_Destino e CK_FinFolhasDesfeitas_Destino) aceitam a INEXISTENTE, com os mesmos nomes. A lançada continua
--    fora das desfeitas (só a exceção se desfaz). A observação obrigatória fora da lançada (CK_FinFolhas_Observacao) já vale para a nova.
--
-- Idempotente: a coluna só cresce se ainda for menor; o CHECK só é trocado se ainda não tiver a INEXISTENTE, e a troca (tirar e pôr de novo com
-- o mesmo nome) vai numa transação só, sem janela em que a tabela fique sem a restrição.
-- ============================================================

-- ---- 1. o destino com 11 letras ----

IF COL_LENGTH(N'dbo.FinFolhas', N'Destino') < 24
    ALTER TABLE dbo.FinFolhas ALTER COLUMN Destino NVARCHAR(12) NOT NULL;
GO
IF COL_LENGTH(N'dbo.FinFolhasDesfeitas', N'Destino') < 24
    ALTER TABLE dbo.FinFolhasDesfeitas ALTER COLUMN Destino NVARCHAR(12) NOT NULL;
GO

-- ---- 2. os CHECKs do destino com a inexistente ----

SET XACT_ABORT ON;
IF NOT EXISTS (SELECT 1 FROM sys.check_constraints
               WHERE name = N'CK_FinFolhas_Destino' AND parent_object_id = OBJECT_ID(N'dbo.FinFolhas') AND definition LIKE N'%''INEXISTENTE''%')
BEGIN
    BEGIN TRANSACTION;
    IF EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = N'CK_FinFolhas_Destino' AND parent_object_id = OBJECT_ID(N'dbo.FinFolhas'))
        ALTER TABLE dbo.FinFolhas DROP CONSTRAINT CK_FinFolhas_Destino;
    ALTER TABLE dbo.FinFolhas WITH CHECK ADD CONSTRAINT CK_FinFolhas_Destino
        CHECK (Destino IS NOT NULL AND Destino IN ('LANCADA', 'CANCELADA', 'ARRANCADA', 'EXTRAVIADA', 'INEXISTENTE'));
    COMMIT TRANSACTION;
END
GO

SET XACT_ABORT ON;
IF NOT EXISTS (SELECT 1 FROM sys.check_constraints
               WHERE name = N'CK_FinFolhasDesfeitas_Destino' AND parent_object_id = OBJECT_ID(N'dbo.FinFolhasDesfeitas') AND definition LIKE N'%''INEXISTENTE''%')
BEGIN
    BEGIN TRANSACTION;
    IF EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = N'CK_FinFolhasDesfeitas_Destino' AND parent_object_id = OBJECT_ID(N'dbo.FinFolhasDesfeitas'))
        ALTER TABLE dbo.FinFolhasDesfeitas DROP CONSTRAINT CK_FinFolhasDesfeitas_Destino;
    ALTER TABLE dbo.FinFolhasDesfeitas WITH CHECK ADD CONSTRAINT CK_FinFolhasDesfeitas_Destino
        CHECK (Destino IS NOT NULL AND Destino IN ('CANCELADA', 'ARRANCADA', 'EXTRAVIADA', 'INEXISTENTE'));
    COMMIT TRANSACTION;
END
GO
