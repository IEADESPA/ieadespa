-- ============================================================
-- Migração 123 — Sessão revogável (v7.6): índices de SessoesAtivas para a lista de sessões encerradas.
--
-- Toda requisição com token passa por api/shared/entrada.js, que relê (no máximo a cada 3 s por instância) os SessaoId encerrados nas últimas 14 horas:
--   SELECT SessaoId FROM SessoesAtivas WHERE Encerrada = 1 AND EncerradaEm >= DATEADD(hour, -14, SYSUTCDATETIME())
-- A tabela cresce uma linha por login e nunca é apagada; sem índice essa leitura varreria a tabela inteira várias vezes por minuto.
--   1) IX_SessoesAtivas_Encerradas: filtrado (só Encerrada = 1), chave EncerradaEm — a leitura acima vira uma busca por faixa de data. A chave primária (SessaoId)
--      já vai junto em todo índice não clusterizado, então não precisa de INCLUDE.
--   2) IX_SessoesAtivas_Abertas: filtrado (só Encerrada = 0), chave CriadoEm — "derrubar todas as sessões abertas" (renomear congregação, mudar permissões de um
--      papel) só olha as criadas nas últimas 13 horas. A busca por pessoa já tem IX_SessoesAtivas_Membro (MembroId, CriadoEm), da migração 085.
--
-- Índice filtrado exige ANSI_NULLS e QUOTED_IDENTIFIER ligados na sessão que grava a tabela — é o padrão do driver da API (mssql/tedious) e do executor de migrações;
-- a migração os liga explicitamente. Só cria se a tabela existir e o índice não existir; a criação vai em TRY/CATCH e uma falha vira AVISO (não derruba o deploy).
-- Idempotente: seguro para reexecutar. Não altera nem apaga linha nenhuma.
-- ============================================================

SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO

IF OBJECT_ID(N'dbo.SessoesAtivas', N'U') IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_SessoesAtivas_Encerradas' AND object_id = OBJECT_ID(N'dbo.SessoesAtivas'))
BEGIN
    BEGIN TRY
        CREATE INDEX IX_SessoesAtivas_Encerradas ON dbo.SessoesAtivas (EncerradaEm) WHERE Encerrada = 1;
    END TRY
    BEGIN CATCH
        PRINT N'AVISO migração 123: índice IX_SessoesAtivas_Encerradas NÃO criado — ' + ERROR_MESSAGE();
    END CATCH
END
GO

IF OBJECT_ID(N'dbo.SessoesAtivas', N'U') IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_SessoesAtivas_Abertas' AND object_id = OBJECT_ID(N'dbo.SessoesAtivas'))
BEGIN
    BEGIN TRY
        CREATE INDEX IX_SessoesAtivas_Abertas ON dbo.SessoesAtivas (CriadoEm) INCLUDE (MembroId) WHERE Encerrada = 0;
    END TRY
    BEGIN CATCH
        PRINT N'AVISO migração 123: índice IX_SessoesAtivas_Abertas NÃO criado — ' + ERROR_MESSAGE();
    END CATCH
END
GO
