-- ============================================================
-- Migração 128 — Defesa em profundidade no banco (2 de 5): credenciamento e presença uma vez por sessão.
--
-- Mesma regra de segurança da 127: cada índice ÚNICO só é criado se NÃO houver repetição hoje; havendo, a migração só imprime um AVISO (com contagem, nunca com nome ou
-- matrícula: o log do GitHub de repositório público é público) e segue, e o índice entra sozinho no deploy seguinte à limpeza. Nunca apaga nem altera linha. A criação vai
-- em TRY/CATCH, então uma repetição que apareça entre a conferência e a criação também vira só aviso. Idempotente: seguro para reexecutar.
--
-- 1) CredenciamentosAssembleia (SessaoId, MembroId) WHERE Resultado = 'CREDENCIADO' — a mesa credencia a mesma pessoa UMA vez por Assembleia. A tabela é uma trilha de
--    tentativas: a RECUSA pode se repetir (a pessoa volta à porta, é recusada de novo, e o histórico fica), por isso o filtro é só sobre quem foi CREDENCIADO. Até aqui a rota
--    nem conferia: dois cliques gravavam duas linhas CREDENCIADO. Conferência: SELECT SessaoId, MembroId, COUNT(*) FROM dbo.CredenciamentosAssembleia
--    WHERE Resultado = 'CREDENCIADO' GROUP BY SessaoId, MembroId HAVING COUNT(*) > 1;
-- 2) Presencas (SessaoId, MembroId) — uma linha por pessoa por reunião. O total de credenciados do relatório da Assembleia e o radar de faltas (RadarDisciplinar, "3 faltas =
--    perda de assento") contam LINHAS de Presencas. Três rotas gravam presença (portaria, credenciamento da mesa e o fechamento da reunião, que lança as faltas) e as três
--    conferem com um SELECT antes do INSERT, que dois pedidos simultâneos furam: a pessoa ficava com duas presenças, ou uma presença e uma falta, e uma falta em dobro
--    adianta a perda do assento. Sem filtro: a regra vale para presença e para falta. Conferência: SELECT SessaoId, MembroId, COUNT(*) FROM dbo.Presencas GROUP BY SessaoId,
--    MembroId HAVING COUNT(*) > 1; (cuidado: presença/falta alimenta o radar disciplinar — decida qual linha fica antes de apagar a outra, de preferência com a trilha de
--    auditoria.)
-- ============================================================

DECLARE @repetidos INT;
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UX_CredenciamentosAssembleia_Credenciado' AND object_id = OBJECT_ID(N'dbo.CredenciamentosAssembleia'))
BEGIN
    SELECT @repetidos = COUNT(*) FROM (SELECT 1 AS x FROM dbo.CredenciamentosAssembleia WHERE Resultado = N'CREDENCIADO' GROUP BY SessaoId, MembroId HAVING COUNT(*) > 1) d;
    IF @repetidos > 0
        PRINT N'AVISO migração 128: índice UX_CredenciamentosAssembleia_Credenciado NÃO criado — há ' + CAST(@repetidos AS NVARCHAR(12))
            + N' pessoa(s) credenciada(s) mais de uma vez na mesma sessão em CredenciamentosAssembleia. Corrija e o próximo deploy cria o índice sozinho (consulta de conferência no cabeçalho da migração).';
    ELSE
    BEGIN
        BEGIN TRY
            CREATE UNIQUE INDEX UX_CredenciamentosAssembleia_Credenciado ON dbo.CredenciamentosAssembleia (SessaoId, MembroId) WHERE Resultado = N'CREDENCIADO';
        END TRY
        BEGIN CATCH
            PRINT N'AVISO migração 128: índice UX_CredenciamentosAssembleia_Credenciado NÃO criado — ' + ERROR_MESSAGE();
        END CATCH
    END
END
GO

DECLARE @repetidos INT;
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UX_Presencas_Sessao_Membro' AND object_id = OBJECT_ID(N'dbo.Presencas'))
BEGIN
    SELECT @repetidos = COUNT(*) FROM (SELECT 1 AS x FROM dbo.Presencas GROUP BY SessaoId, MembroId HAVING COUNT(*) > 1) d;
    IF @repetidos > 0
        PRINT N'AVISO migração 128: índice UX_Presencas_Sessao_Membro NÃO criado — há ' + CAST(@repetidos AS NVARCHAR(12))
            + N' pessoa(s) com mais de uma linha de presença na mesma reunião em Presencas. Corrija e o próximo deploy cria o índice sozinho (consulta de conferência no cabeçalho da migração).';
    ELSE
    BEGIN
        BEGIN TRY
            CREATE UNIQUE INDEX UX_Presencas_Sessao_Membro ON dbo.Presencas (SessaoId, MembroId);
        END TRY
        BEGIN CATCH
            PRINT N'AVISO migração 128: índice UX_Presencas_Sessao_Membro NÃO criado — ' + ERROR_MESSAGE();
        END CATCH
    END
END
GO
