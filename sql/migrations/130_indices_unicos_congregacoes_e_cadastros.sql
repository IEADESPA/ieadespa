-- ============================================================
-- Migração 130 — Defesa em profundidade no banco (4 de 5): nome único de congregação e chaves únicas dos cadastros.
--
-- Mesma regra de segurança da 127: cada índice ÚNICO só é criado se NÃO houver repetição hoje; havendo, a migração só imprime um AVISO (com contagem, nunca com nome: o log
-- do GitHub de repositório público é público) e segue, e o índice entra sozinho no deploy seguinte à limpeza. Nunca apaga nem altera linha. A criação vai em TRY/CATCH.
-- Idempotente: seguro para reexecutar. Todas as comparações usam a collation da própria coluna (SQL_Latin1_General_CP1_CI_AS no Azure SQL): maiúscula/minúscula e espaço no
-- fim NÃO distinguem, acento distingue. É a mesma regra do "WHERE Nome = @x" das rotas; o índice só ignora o que a collation já ignora.
--
-- 1) Congregacoes (Nome) — o escopo de acesso compara o NOME da congregação (auth.estaNoEscopo: a sessão guarda a lista de nomes). Duas congregações homônimas
--    compartilhariam acesso: quem enxerga uma enxergaria a outra. Sem filtro: o escopo resolve o nome de TODAS as linhas (shared/escopo.js não olha Ativa), inclusive de
--    congregação desativada. Como o escopo compara texto exato e a collation é mais frouxa (não distingue maiúscula), o índice pode recusar um par que o escopo trataria
--    como diferente ('Sede' e 'SEDE'); é o lado seguro. Conferência: SELECT Nome, COUNT(*) FROM dbo.Congregacoes GROUP BY Nome HAVING COUNT(*) > 1;
-- 2) Congregacoes (Slug) WHERE Slug IS NOT NULL — o endereço da congregação no site (CongregacoesPublico procura por Slug e devolve UMA linha). Slug vazio ou nulo é
--    "sem endereço no site" e pode repetir. Conferência: SELECT Slug, COUNT(*) FROM dbo.Congregacoes WHERE Slug IS NOT NULL AND Slug <> N'' GROUP BY Slug HAVING COUNT(*) > 1;
-- 3) Chaves dos cadastros que o código usa como junção ou como texto fixo: CargosMinisteriais.Sigla (LEFT JOIN em listas de membros e cartas: sigla repetida duplicaria a
--    linha da pessoa), Departamentos.Sigla (WHERE Sigla = 'EBD'...), Papeis.Nome (JOIN Papeis ... Nome = 'Dirigente de Congregação' e as migrações 120/122), SituacoesMembro.Sigla,
--    StatusMembro.Sigla, Prazos.Sigla e Funcionalidades.Chave. As migrações que semeiam esses cadastros já conferem "WHERE NOT EXISTS (... = valor)" pela mesma chave, então a
--    regra do banco é só a mesma regra que o seed sempre assumiu. Conferência de cada um: SELECT <coluna>, COUNT(*) FROM dbo.<tabela> GROUP BY <coluna> HAVING COUNT(*) > 1;
--    As rotas de cadastro (GestaoCatalogos) respondem 409 com mensagem amigável quando o banco recusa uma repetição.
-- ============================================================

DECLARE @repetidos INT;
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UX_Congregacoes_Nome' AND object_id = OBJECT_ID(N'dbo.Congregacoes'))
BEGIN
    SELECT @repetidos = COUNT(*) FROM (SELECT 1 AS x FROM dbo.Congregacoes GROUP BY Nome HAVING COUNT(*) > 1) d;
    IF @repetidos > 0
        PRINT N'AVISO migração 130: índice UX_Congregacoes_Nome NÃO criado — há ' + CAST(@repetidos AS NVARCHAR(12))
            + N' nome(s) de congregação repetido(s) (homônimas) em Congregacoes. Corrija e o próximo deploy cria o índice sozinho (consulta de conferência no cabeçalho da migração).';
    ELSE
    BEGIN
        BEGIN TRY
            CREATE UNIQUE INDEX UX_Congregacoes_Nome ON dbo.Congregacoes (Nome);
        END TRY
        BEGIN CATCH
            PRINT N'AVISO migração 130: índice UX_Congregacoes_Nome NÃO criado — ' + ERROR_MESSAGE();
        END CATCH
    END
END
GO

DECLARE @repetidos INT;
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UX_Congregacoes_Slug' AND object_id = OBJECT_ID(N'dbo.Congregacoes'))
BEGIN
    SELECT @repetidos = COUNT(*) FROM (SELECT 1 AS x FROM dbo.Congregacoes WHERE Slug IS NOT NULL AND Slug <> N'' GROUP BY Slug HAVING COUNT(*) > 1) d;
    IF @repetidos > 0
        PRINT N'AVISO migração 130: índice UX_Congregacoes_Slug NÃO criado — há ' + CAST(@repetidos AS NVARCHAR(12))
            + N' endereço(s) de site (slug) repetido(s) em Congregacoes. Corrija e o próximo deploy cria o índice sozinho (consulta de conferência no cabeçalho da migração).';
    ELSE
    BEGIN
        BEGIN TRY
            CREATE UNIQUE INDEX UX_Congregacoes_Slug ON dbo.Congregacoes (Slug) WHERE Slug IS NOT NULL AND Slug <> N'';
        END TRY
        BEGIN CATCH
            PRINT N'AVISO migração 130: índice UX_Congregacoes_Slug NÃO criado — ' + ERROR_MESSAGE();
        END CATCH
    END
END
GO

DECLARE @repetidos INT;
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UX_CargosMinisteriais_Sigla' AND object_id = OBJECT_ID(N'dbo.CargosMinisteriais'))
BEGIN
    SELECT @repetidos = COUNT(*) FROM (SELECT 1 AS x FROM dbo.CargosMinisteriais GROUP BY Sigla HAVING COUNT(*) > 1) d;
    IF @repetidos > 0
        PRINT N'AVISO migração 130: índice UX_CargosMinisteriais_Sigla NÃO criado — há ' + CAST(@repetidos AS NVARCHAR(12))
            + N' sigla(s) de cargo ministerial repetida(s) em CargosMinisteriais. Corrija e o próximo deploy cria o índice sozinho (consulta de conferência no cabeçalho da migração).';
    ELSE
    BEGIN
        BEGIN TRY
            CREATE UNIQUE INDEX UX_CargosMinisteriais_Sigla ON dbo.CargosMinisteriais (Sigla);
        END TRY
        BEGIN CATCH
            PRINT N'AVISO migração 130: índice UX_CargosMinisteriais_Sigla NÃO criado — ' + ERROR_MESSAGE();
        END CATCH
    END
END
GO

DECLARE @repetidos INT;
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UX_Departamentos_Sigla' AND object_id = OBJECT_ID(N'dbo.Departamentos'))
BEGIN
    SELECT @repetidos = COUNT(*) FROM (SELECT 1 AS x FROM dbo.Departamentos GROUP BY Sigla HAVING COUNT(*) > 1) d;
    IF @repetidos > 0
        PRINT N'AVISO migração 130: índice UX_Departamentos_Sigla NÃO criado — há ' + CAST(@repetidos AS NVARCHAR(12))
            + N' sigla(s) de departamento repetida(s) em Departamentos. Corrija e o próximo deploy cria o índice sozinho (consulta de conferência no cabeçalho da migração).';
    ELSE
    BEGIN
        BEGIN TRY
            CREATE UNIQUE INDEX UX_Departamentos_Sigla ON dbo.Departamentos (Sigla);
        END TRY
        BEGIN CATCH
            PRINT N'AVISO migração 130: índice UX_Departamentos_Sigla NÃO criado — ' + ERROR_MESSAGE();
        END CATCH
    END
END
GO

DECLARE @repetidos INT;
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UX_Papeis_Nome' AND object_id = OBJECT_ID(N'dbo.Papeis'))
BEGIN
    SELECT @repetidos = COUNT(*) FROM (SELECT 1 AS x FROM dbo.Papeis GROUP BY Nome HAVING COUNT(*) > 1) d;
    IF @repetidos > 0
        PRINT N'AVISO migração 130: índice UX_Papeis_Nome NÃO criado — há ' + CAST(@repetidos AS NVARCHAR(12))
            + N' nome(s) de papel repetido(s) em Papeis. Corrija e o próximo deploy cria o índice sozinho (consulta de conferência no cabeçalho da migração).';
    ELSE
    BEGIN
        BEGIN TRY
            CREATE UNIQUE INDEX UX_Papeis_Nome ON dbo.Papeis (Nome);
        END TRY
        BEGIN CATCH
            PRINT N'AVISO migração 130: índice UX_Papeis_Nome NÃO criado — ' + ERROR_MESSAGE();
        END CATCH
    END
END
GO

DECLARE @repetidos INT;
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UX_SituacoesMembro_Sigla' AND object_id = OBJECT_ID(N'dbo.SituacoesMembro'))
BEGIN
    SELECT @repetidos = COUNT(*) FROM (SELECT 1 AS x FROM dbo.SituacoesMembro GROUP BY Sigla HAVING COUNT(*) > 1) d;
    IF @repetidos > 0
        PRINT N'AVISO migração 130: índice UX_SituacoesMembro_Sigla NÃO criado — há ' + CAST(@repetidos AS NVARCHAR(12))
            + N' sigla(s) de situação de membro repetida(s) em SituacoesMembro. Corrija e o próximo deploy cria o índice sozinho (consulta de conferência no cabeçalho da migração).';
    ELSE
    BEGIN
        BEGIN TRY
            CREATE UNIQUE INDEX UX_SituacoesMembro_Sigla ON dbo.SituacoesMembro (Sigla);
        END TRY
        BEGIN CATCH
            PRINT N'AVISO migração 130: índice UX_SituacoesMembro_Sigla NÃO criado — ' + ERROR_MESSAGE();
        END CATCH
    END
END
GO

DECLARE @repetidos INT;
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UX_StatusMembro_Sigla' AND object_id = OBJECT_ID(N'dbo.StatusMembro'))
BEGIN
    SELECT @repetidos = COUNT(*) FROM (SELECT 1 AS x FROM dbo.StatusMembro GROUP BY Sigla HAVING COUNT(*) > 1) d;
    IF @repetidos > 0
        PRINT N'AVISO migração 130: índice UX_StatusMembro_Sigla NÃO criado — há ' + CAST(@repetidos AS NVARCHAR(12))
            + N' sigla(s) de status de membro repetida(s) em StatusMembro. Corrija e o próximo deploy cria o índice sozinho (consulta de conferência no cabeçalho da migração).';
    ELSE
    BEGIN
        BEGIN TRY
            CREATE UNIQUE INDEX UX_StatusMembro_Sigla ON dbo.StatusMembro (Sigla);
        END TRY
        BEGIN CATCH
            PRINT N'AVISO migração 130: índice UX_StatusMembro_Sigla NÃO criado — ' + ERROR_MESSAGE();
        END CATCH
    END
END
GO

DECLARE @repetidos INT;
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UX_Prazos_Sigla' AND object_id = OBJECT_ID(N'dbo.Prazos'))
BEGIN
    SELECT @repetidos = COUNT(*) FROM (SELECT 1 AS x FROM dbo.Prazos GROUP BY Sigla HAVING COUNT(*) > 1) d;
    IF @repetidos > 0
        PRINT N'AVISO migração 130: índice UX_Prazos_Sigla NÃO criado — há ' + CAST(@repetidos AS NVARCHAR(12))
            + N' sigla(s) de prazo repetida(s) em Prazos. Corrija e o próximo deploy cria o índice sozinho (consulta de conferência no cabeçalho da migração).';
    ELSE
    BEGIN
        BEGIN TRY
            CREATE UNIQUE INDEX UX_Prazos_Sigla ON dbo.Prazos (Sigla);
        END TRY
        BEGIN CATCH
            PRINT N'AVISO migração 130: índice UX_Prazos_Sigla NÃO criado — ' + ERROR_MESSAGE();
        END CATCH
    END
END
GO

DECLARE @repetidos INT;
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UX_Funcionalidades_Chave' AND object_id = OBJECT_ID(N'dbo.Funcionalidades'))
BEGIN
    SELECT @repetidos = COUNT(*) FROM (SELECT 1 AS x FROM dbo.Funcionalidades GROUP BY Chave HAVING COUNT(*) > 1) d;
    IF @repetidos > 0
        PRINT N'AVISO migração 130: índice UX_Funcionalidades_Chave NÃO criado — há ' + CAST(@repetidos AS NVARCHAR(12))
            + N' chave(s) de funcionalidade repetida(s) em Funcionalidades. Corrija e o próximo deploy cria o índice sozinho (consulta de conferência no cabeçalho da migração).';
    ELSE
    BEGIN
        BEGIN TRY
            CREATE UNIQUE INDEX UX_Funcionalidades_Chave ON dbo.Funcionalidades (Chave);
        END TRY
        BEGIN CATCH
            PRINT N'AVISO migração 130: índice UX_Funcionalidades_Chave NÃO criado — ' + ERROR_MESSAGE();
        END CATCH
    END
END
GO

