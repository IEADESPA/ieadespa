-- ============================================================
-- Migração 129 — Defesa em profundidade no banco (3 de 5): pagamento em uma só remessa, número de remessa e geração de prebenda.
--
-- Mesma regra de segurança da 127: cada índice ÚNICO só é criado se NÃO houver repetição hoje; havendo, a migração só imprime um AVISO (com contagem, nunca com nome, CPF
-- ou valor: o log do GitHub de repositório público é público) e segue, e o índice entra sozinho no deploy seguinte à limpeza. Nunca apaga nem altera linha. A criação vai em
-- TRY/CATCH. Idempotente: seguro para reexecutar.
--
-- 1) RemessaItens (SaidaId) WHERE Status IN ('PENDENTE', 'PROCESSADO') — o mesmo pagamento (Saída) em NO MÁXIMO UMA remessa viva. Uma remessa em que ele FALHOU deixa de contar
--    (o item vira FALHOU e a Saída pode entrar numa remessa nova): o filtro é exatamente o conjunto que a rota de geração já exclui (GestaoRemessasBancarias). O item só anda
--    de PENDENTE para PROCESSADO ou FALHOU (ProcessarRetornoRemessa), nunca volta, então nenhuma atualização legítima viola o índice. Se dois itens vivos da mesma Saída
--    existissem, o banco pagaria duas vezes. Conferência: SELECT SaidaId, COUNT(*) FROM dbo.RemessaItens WHERE Status IN ('PENDENTE', 'PROCESSADO')
--    GROUP BY SaidaId HAVING COUNT(*) > 1;
-- 2) RemessasBancarias (NumeroSequencial) — o número do arquivo CNAB nunca reinicia nem repete (é o número que o banco vê). A rota calcula MAX + 1 sob trava de aplicação;
--    o índice garante o mesmo no banco. Sem filtro: toda remessa conta, inclusive a já processada. Conferência: SELECT NumeroSequencial, COUNT(*) FROM
--    dbo.RemessasBancarias GROUP BY NumeroSequencial HAVING COUNT(*) > 1;
-- 3) PrebendaGeracoes (MesReferencia, PrebendadoId) — um registro por prebendado por competência. A migração 060 já criou a restrição UQ_PrebendaGeracao_MesPessoa com
--    exatamente essa chave; aqui só se GARANTE que alguma restrição/índice único com essas duas colunas existe (por exemplo, se a tabela tiver nascido por outro caminho). Se
--    existir, não faz nada; se não existir e não houver repetição, cria. Sem filtro: uma geração CANCELADA também ocupa o mês (mesmo comportamento da restrição original).
--    Conferência: SELECT MesReferencia, PrebendadoId, COUNT(*) FROM dbo.PrebendaGeracoes GROUP BY MesReferencia, PrebendadoId HAVING COUNT(*) > 1;
-- ============================================================

DECLARE @repetidos INT;
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UX_RemessaItens_SaidaViva' AND object_id = OBJECT_ID(N'dbo.RemessaItens'))
BEGIN
    SELECT @repetidos = COUNT(*) FROM (SELECT 1 AS x FROM dbo.RemessaItens WHERE Status IN (N'PENDENTE', N'PROCESSADO') GROUP BY SaidaId HAVING COUNT(*) > 1) d;
    IF @repetidos > 0
        PRINT N'AVISO migração 129: índice UX_RemessaItens_SaidaViva NÃO criado — há ' + CAST(@repetidos AS NVARCHAR(12))
            + N' pagamento(s) em mais de uma remessa viva (pendente ou processada) em RemessaItens. Corrija e o próximo deploy cria o índice sozinho (consulta de conferência no cabeçalho da migração).';
    ELSE
    BEGIN
        BEGIN TRY
            CREATE UNIQUE INDEX UX_RemessaItens_SaidaViva ON dbo.RemessaItens (SaidaId) WHERE Status IN (N'PENDENTE', N'PROCESSADO');
        END TRY
        BEGIN CATCH
            PRINT N'AVISO migração 129: índice UX_RemessaItens_SaidaViva NÃO criado — ' + ERROR_MESSAGE();
        END CATCH
    END
END
GO

DECLARE @repetidos INT;
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UX_RemessasBancarias_Numero' AND object_id = OBJECT_ID(N'dbo.RemessasBancarias'))
BEGIN
    SELECT @repetidos = COUNT(*) FROM (SELECT 1 AS x FROM dbo.RemessasBancarias GROUP BY NumeroSequencial HAVING COUNT(*) > 1) d;
    IF @repetidos > 0
        PRINT N'AVISO migração 129: índice UX_RemessasBancarias_Numero NÃO criado — há ' + CAST(@repetidos AS NVARCHAR(12))
            + N' número(s) de remessa repetido(s) em RemessasBancarias. Corrija e o próximo deploy cria o índice sozinho (consulta de conferência no cabeçalho da migração).';
    ELSE
    BEGIN
        BEGIN TRY
            CREATE UNIQUE INDEX UX_RemessasBancarias_Numero ON dbo.RemessasBancarias (NumeroSequencial);
        END TRY
        BEGIN CATCH
            PRINT N'AVISO migração 129: índice UX_RemessasBancarias_Numero NÃO criado — ' + ERROR_MESSAGE();
        END CATCH
    END
END
GO

-- Existe algum índice/restrição ÚNICO, sem filtro, cuja chave seja exatamente (MesReferencia, PrebendadoId), com o nome que for?
DECLARE @repetidos INT;
IF NOT EXISTS (
    SELECT 1 FROM sys.indexes i
    WHERE i.object_id = OBJECT_ID(N'dbo.PrebendaGeracoes') AND i.is_unique = 1 AND i.has_filter = 0
      AND (SELECT COUNT(*) FROM sys.index_columns ic WHERE ic.object_id = i.object_id AND ic.index_id = i.index_id AND ic.is_included_column = 0) = 2
      AND (SELECT COUNT(*) FROM sys.index_columns ic JOIN sys.columns c ON c.object_id = ic.object_id AND c.column_id = ic.column_id
           WHERE ic.object_id = i.object_id AND ic.index_id = i.index_id AND ic.is_included_column = 0 AND c.name IN (N'MesReferencia', N'PrebendadoId')) = 2)
BEGIN
    SELECT @repetidos = COUNT(*) FROM (SELECT 1 AS x FROM dbo.PrebendaGeracoes GROUP BY MesReferencia, PrebendadoId HAVING COUNT(*) > 1) d;
    IF @repetidos > 0
        PRINT N'AVISO migração 129: índice UX_PrebendaGeracoes_Mes_Prebendado NÃO criado — há ' + CAST(@repetidos AS NVARCHAR(12))
            + N' prebendado(s) com mais de uma geração na mesma competência em PrebendaGeracoes. Corrija e o próximo deploy cria o índice sozinho (consulta de conferência no cabeçalho da migração).';
    ELSE
    BEGIN
        BEGIN TRY
            CREATE UNIQUE INDEX UX_PrebendaGeracoes_Mes_Prebendado ON dbo.PrebendaGeracoes (MesReferencia, PrebendadoId);
        END TRY
        BEGIN CATCH
            PRINT N'AVISO migração 129: índice UX_PrebendaGeracoes_Mes_Prebendado NÃO criado — ' + ERROR_MESSAGE();
        END CATCH
    END
END
GO
