-- ============================================================
-- Migração 139 — Defesa em profundidade: o mesmo pagamento (Saída) em NO MÁXIMO UM item de remessa "em aberto".
--
-- A migração 129 criou UX_RemessaItens_SaidaViva (Status PENDENTE ou PROCESSADO). O retorno do banco ganhou um terceiro estado, DIVERGENTE (o banco pagou, mas a Saída deixou de
-- passar nas conferências do pagamento comum e a Tesouraria Geral ainda vai tratar): enquanto ele existe, a Saída também não pode entrar numa remessa nova — o banco pagaria duas
-- vezes. A rota de geração já exclui esse caso; este índice garante o mesmo no banco. O item só anda PENDENTE → (PROCESSADO | FALHOU | DIVERGENTE) e DIVERGENTE → (PROCESSADO |
-- FALHOU), então nenhuma atualização legítima viola o índice.
--
-- Mesma regra de segurança da 127/129: o índice só é criado se NÃO houver repetição hoje; havendo, a migração imprime um AVISO (com contagem, nunca nome, CPF ou valor: o log do
-- GitHub de repositório público é público) e segue, e o índice entra sozinho no deploy seguinte à limpeza. A criação vai em TRY/CATCH. Nunca apaga nem altera linha.
-- Idempotente: seguro para reexecutar. Conferência: SELECT SaidaId, COUNT(*) FROM dbo.RemessaItens WHERE Status IN ('PENDENTE', 'PROCESSADO', 'DIVERGENTE')
-- GROUP BY SaidaId HAVING COUNT(*) > 1;
-- ============================================================

DECLARE @repetidos INT;
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UX_RemessaItens_SaidaAberta' AND object_id = OBJECT_ID(N'dbo.RemessaItens'))
BEGIN
    SELECT @repetidos = COUNT(*) FROM (SELECT 1 AS x FROM dbo.RemessaItens WHERE Status IN (N'PENDENTE', N'PROCESSADO', N'DIVERGENTE') GROUP BY SaidaId HAVING COUNT(*) > 1) d;
    IF @repetidos > 0
        PRINT N'AVISO migração 139: índice UX_RemessaItens_SaidaAberta NÃO criado — há ' + CAST(@repetidos AS NVARCHAR(12))
            + N' pagamento(s) em mais de um item de remessa em aberto (pendente, processado ou divergente). Corrija e o próximo deploy cria o índice sozinho (consulta de conferência no cabeçalho da migração).';
    ELSE
    BEGIN
        BEGIN TRY
            CREATE UNIQUE INDEX UX_RemessaItens_SaidaAberta ON dbo.RemessaItens (SaidaId) WHERE Status IN (N'PENDENTE', N'PROCESSADO', N'DIVERGENTE');
        END TRY
        BEGIN CATCH
            PRINT N'AVISO migração 139: índice UX_RemessaItens_SaidaAberta NÃO criado — ' + ERROR_MESSAGE();
        END CATCH
    END
END
GO
