-- ============================================================
-- Migração 301 — uma licença por candidatura ABERTA por pessoa (índice único filtrado).
--
-- A licença por candidatura (GestaoLicencasCandidatura) tira a pessoa do rol ativo até a Diretoria decidir o retorno. Duas licenças
-- abertas da mesma pessoa deixariam a decisão do retorno pela metade: uma fecha, a outra continua aberta, e a situação no rol fica
-- sem dono. Decisão de 25/11/2026 (revisão de fora): uma licença aberta por pessoa; a rota recusa a segunda com a mensagem clara
-- (antes e dentro da transação), e este índice faz o próprio banco recusar a que escapar.
--
-- O índice falharia no deploy se a produção já tivesse duplicadas abertas. Por isso, ANTES de criá-lo, a migração fecha as que
-- existirem, sem perder nada:
--   * de cada pessoa, fica aberta a licença MAIS ANTIGA (CriadoEm, e LicencaId no empate);
--   * as outras recebem a marca própria DUPLICADA (Status), a data de hoje em Brasília (DataRetornoDecidida) e a observação com o
--     número da licença que ficou aberta (ObservacaoRetorno). Nenhuma linha é apagada; a situação da pessoa no rol não muda;
--   * a trilha (AuditLog) não é gravada daqui: o encadeamento dela é calculado no Node. O registro do que foi feito fica em cada
--     licença fechada (a marca, a data e a observação) e na contagem impressa no log do deploy (só a contagem: o log do GitHub de
--     repositório público é público — nunca matrícula nem nome).
-- A criação do índice vai em TRY/CATCH: uma duplicada que surja no meio vira AVISO (com o número do erro, sem a mensagem, que traz
-- o valor da chave), e o próximo deploy tenta de novo.
--
-- Conferência: SELECT MembroId, COUNT(*) FROM dbo.LicencasCandidatura WHERE Status = N'EM_LICENCA' GROUP BY MembroId HAVING COUNT(*) > 1;
-- Número 301: acima das faixas em construção (Membros até a 187, Financeiro até a 203), depois da 300 deste ramo.
-- Idempotente: com o índice criado, não faz nada; num banco sem nenhuma licença (ou sem duplicada), só cria o índice.
-- ============================================================

DECLARE @fechadas INT = 0;
IF OBJECT_ID(N'dbo.LicencasCandidatura', N'U') IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UX_LicencasCandidatura_Aberta' AND object_id = OBJECT_ID(N'dbo.LicencasCandidatura'))
BEGIN
    ;WITH abertas AS (
        SELECT LicencaId,
               ROW_NUMBER() OVER (PARTITION BY MembroId ORDER BY CriadoEm, LicencaId) AS Ordem,
               FIRST_VALUE(LicencaId) OVER (PARTITION BY MembroId ORDER BY CriadoEm, LicencaId) AS Mantida
        FROM dbo.LicencasCandidatura WHERE Status = N'EM_LICENCA'
    )
    UPDATE l
       SET Status = N'DUPLICADA',
           DataRetornoDecidida = CONVERT(date, DATEADD(hour, -3, SYSUTCDATETIME())),
           ObservacaoRetorno = N'Registro em duplicidade, encerrado na conferência do sistema: a licença que vale é a nº ' + CAST(a.Mantida AS NVARCHAR(12)) + N'.'
      FROM dbo.LicencasCandidatura l
      JOIN abertas a ON a.LicencaId = l.LicencaId
     WHERE a.Ordem > 1 AND l.Status = N'EM_LICENCA';
    SET @fechadas = @@ROWCOUNT;
    IF @fechadas > 0
        PRINT N'Migração 301: ' + CAST(@fechadas AS NVARCHAR(12))
            + N' licença(s) por candidatura duplicada(s) fechada(s) como DUPLICADA (de cada pessoa ficou aberta a mais antiga).';

    BEGIN TRY
        CREATE UNIQUE INDEX UX_LicencasCandidatura_Aberta ON dbo.LicencasCandidatura (MembroId) WHERE Status = N'EM_LICENCA';
    END TRY
    BEGIN CATCH
        PRINT N'AVISO migração 301: índice UX_LicencasCandidatura_Aberta NÃO criado (erro ' + CAST(ERROR_NUMBER() AS NVARCHAR(12))
            + N'); o próximo deploy fecha as duplicadas e tenta de novo (consulta de conferência no cabeçalho da migração).';
    END CATCH
END
GO
