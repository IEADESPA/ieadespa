-- ============================================================
-- Migração 135 — Fornecedores.Ativo garantida (o pagamento, a remessa e o retorno do banco passam a conferir se o fornecedor está ATIVO).
--
-- shared/conferenciaPagamento.js (a conferência única do dinheiro: pagar na mão, gerar a remessa bancária e confirmar o retorno do banco) agora lê `Fornecedores.Ativo` na
-- SELECT da Saída: fornecedor desativado ENTRE a aprovação e o pagamento é barrado ("Fornecedor inativo: reative o cadastro ou use outro fornecedor"). A coluna nasceu na 052
-- (BIT NOT NULL DEFAULT 1) e a tela de fornecedores já a usa; esta migração só GARANTE que ela existe, para uma consulta nova nunca derrubar o pagamento com "Invalid column name"
-- se a tabela tiver nascido por outro caminho (a 052 só cria a tabela se ela não existir, e então pula a coluna). Para a Saída antiga, valor VAZIO (NULL) conta como ATIVO no
-- código: nenhum pagamento já aprovado é bloqueado por falta de preenchimento.
--
-- Só ACRESCENTA a coluna quando falta (DEFAULT 1: toda linha existente nasce ativa). NÃO toca em nenhuma linha que já tenha a coluna, nunca apaga nada. A criação vai em
-- TRY/CATCH: se falhar, vira um AVISO e o deploy segue. Idempotente: com a coluna já presente não faz nada.
-- ============================================================

IF OBJECT_ID(N'dbo.Fornecedores', N'U') IS NOT NULL AND COL_LENGTH(N'dbo.Fornecedores', N'Ativo') IS NULL
BEGIN
    BEGIN TRY
        ALTER TABLE dbo.Fornecedores ADD Ativo BIT NOT NULL CONSTRAINT DF_Fornecedores_Ativo DEFAULT 1;
    END TRY
    BEGIN CATCH
        PRINT N'AVISO migração 135: coluna Fornecedores.Ativo NÃO criada — ' + ERROR_MESSAGE();
    END CATCH
END
GO
