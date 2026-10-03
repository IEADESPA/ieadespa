-- ============================================================
-- Migração 127 — Defesa em profundidade no banco (1 de 5): sigla de órgão, órgão territorial por unidade, cargo ocupado e membro de comissão.
--
-- Até aqui quem impedia a repetição era só o código da rota (um SELECT antes do INSERT). Duas pessoas clicando ao mesmo tempo furam essa checagem, e um acesso direto ao banco
-- nem passa por ela. Estes índices ÚNICOS fazem o próprio banco recusar o que nunca deve existir. Cada um segue a mesma regra de segurança do deploy:
--   * só é criado se NÃO houver repetição hoje (a migração roda a CADA deploy e nunca pode derrubá-lo);
--   * havendo repetição, não corrige nada à força: só imprime um AVISO (o runner o mostra no log do deploy e como anotação do GitHub Actions) e segue. Depois que alguém
--     limpar os dados, o próximo deploy cria o índice sozinho. O aviso traz só CONTAGENS (o log do GitHub de repositório público é público), nunca nome, matrícula ou CPF;
--   * a criação vai em TRY/CATCH: uma repetição que surja entre a conferência e a criação vira aviso, não falha.
-- Nunca apaga nem altera linha alguma.
--
-- 1) Orgaos.Sigla — a sigla é a chave que o código procura (WHERE Sigla = 'DIRETORIA_EXECUTIVA'...). Duas linhas iguais fariam a busca apontar para uma qualquer.
--    Comparação na collation do banco (a mesma do WHERE Sigla = @sigla da rota GetOrgaos): maiúscula/minúscula e espaço no fim não distinguem. Sem filtro: Orgaos não
--    tem coluna de "ativo", todo órgão conta. Conferência: SELECT Sigla, COUNT(*) FROM dbo.Orgaos GROUP BY Sigla HAVING COUNT(*) > 1;
-- 2) OrgaosLocais (Nivel, ReferenciaId, Sigla) — cada unidade (congregação, área, região...) tem UM órgão de cada sigla (JAI, JEA, CRA...). A criação automática da
--    unidade (GestaoCatalogos) usa IF NOT EXISTS, que não é atômico. Sem filtro por Ativo: o código trata o órgão inativo como existente (não recria). Só para órgão
--    ligado a uma unidade (ReferenciaId preenchido). Conferência: SELECT Nivel, ReferenciaId, Sigla, COUNT(*) FROM dbo.OrgaosLocais
--    WHERE ReferenciaId IS NOT NULL GROUP BY Nivel, ReferenciaId, Sigla HAVING COUNT(*) > 1;
-- 3) Assentos (OrgaoId, CargoOuFuncao) — o Estatuto dá UM titular por cargo fixo na Diretoria (Art. 29), no Conselho Fiscal (Art. 43 §1º), no CEI (Art. 88 §1º) e no
--    Conselho Consultivo Técnico (Art. 31): api/shared/diretoria.js, CATALOGOS_CARGOS_POR_ORGAO. Vivo = cadeira sem DataFim (cadeira encerrada guarda o histórico e pode
--    repetir; a de mandato vencido, sem DataFim, ainda conta como ocupada, igual a cargoJaOcupado). O filtro lista os CÓDIGOS dos catálogos: nos demais órgãos
--    (Assembleia, CLI...) o cargo é texto livre e várias pessoas podem ter o mesmo. Se um catálogo novo ganhar código no código-fonte, esta lista tem de crescer junto
--    (api/shared/__tests__/indicesUnicosBanco.test.js confere as duas). Conferência: SELECT OrgaoId, CargoOuFuncao, COUNT(*) FROM dbo.Assentos WHERE DataFim IS NULL
--    AND CargoOuFuncao IN (<os códigos abaixo>) GROUP BY OrgaoId, CargoOuFuncao HAVING COUNT(*) > 1;
-- 4) ComissaoMembros (Sigla, MembroId) WHERE DataFim IS NULL — a mesma pessoa não ocupa duas vezes a mesma comissão (CCJ, PMO) ao mesmo tempo: a rota GestaoComissoes confere
--    "Essa pessoa já está na CCJ" com um SELECT antes do INSERT, que dois pedidos simultâneos furam. Membro que saiu (DataFim preenchida) guarda o histórico e pode voltar
--    depois. O teto de membros da comissão (CCJ 3, PMO 9) é regra de CONTAGEM e continua só na rota (índice único não conta). Conferência: SELECT Sigla, MembroId, COUNT(*)
--    FROM dbo.ComissaoMembros WHERE DataFim IS NULL GROUP BY Sigla, MembroId HAVING COUNT(*) > 1;
--
-- Idempotente: seguro para reexecutar sem apagar dados.
-- ============================================================

DECLARE @repetidos INT;
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UX_Orgaos_Sigla' AND object_id = OBJECT_ID(N'dbo.Orgaos'))
BEGIN
    SELECT @repetidos = COUNT(*) FROM (SELECT 1 AS x FROM dbo.Orgaos GROUP BY Sigla HAVING COUNT(*) > 1) d;
    IF @repetidos > 0
        PRINT N'AVISO migração 127: índice UX_Orgaos_Sigla NÃO criado — há ' + CAST(@repetidos AS NVARCHAR(12))
            + N' sigla(s) de órgão repetida(s) em Orgaos. Corrija e o próximo deploy cria o índice sozinho (consulta de conferência no cabeçalho da migração).';
    ELSE
    BEGIN
        BEGIN TRY
            CREATE UNIQUE INDEX UX_Orgaos_Sigla ON dbo.Orgaos (Sigla);
        END TRY
        BEGIN CATCH
            PRINT N'AVISO migração 127: índice UX_Orgaos_Sigla NÃO criado — ' + ERROR_MESSAGE();
        END CATCH
    END
END
GO

DECLARE @repetidos INT;
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UX_OrgaosLocais_Unidade_Sigla' AND object_id = OBJECT_ID(N'dbo.OrgaosLocais'))
BEGIN
    SELECT @repetidos = COUNT(*) FROM (SELECT 1 AS x FROM dbo.OrgaosLocais WHERE ReferenciaId IS NOT NULL GROUP BY Nivel, ReferenciaId, Sigla HAVING COUNT(*) > 1) d;
    IF @repetidos > 0
        PRINT N'AVISO migração 127: índice UX_OrgaosLocais_Unidade_Sigla NÃO criado — há ' + CAST(@repetidos AS NVARCHAR(12))
            + N' órgão(s) territorial(is) repetido(s) (mesma unidade e mesma sigla) em OrgaosLocais. Corrija e o próximo deploy cria o índice sozinho (consulta de conferência no cabeçalho da migração).';
    ELSE
    BEGIN
        BEGIN TRY
            CREATE UNIQUE INDEX UX_OrgaosLocais_Unidade_Sigla ON dbo.OrgaosLocais (Nivel, ReferenciaId, Sigla) WHERE ReferenciaId IS NOT NULL;
        END TRY
        BEGIN CATCH
            PRINT N'AVISO migração 127: índice UX_OrgaosLocais_Unidade_Sigla NÃO criado — ' + ERROR_MESSAGE();
        END CATCH
    END
END
GO

DECLARE @repetidos INT;
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UX_Assentos_CargoAtivo' AND object_id = OBJECT_ID(N'dbo.Assentos'))
BEGIN
    SELECT @repetidos = COUNT(*) FROM (
        SELECT 1 AS x FROM dbo.Assentos
        WHERE DataFim IS NULL
          AND CargoOuFuncao IN (N'PRESIDENTE', N'VICE_PRESIDENTE_1', N'VICE_PRESIDENTE_2', N'VICE_PRESIDENTE_3', N'VICE_PRESIDENTE_4',
                                N'SECRETARIO_1', N'SECRETARIO_2', N'SECRETARIO_3', N'TESOUREIRO_1', N'TESOUREIRO_2',
                                N'TITULAR_1', N'TITULAR_2', N'TITULAR_3', N'TITULAR_4', N'TITULAR_5', N'TITULAR_6', N'TITULAR_7',
                                N'SUPLENTE_1', N'SUPLENTE_2', N'SUPLENTE_3', N'MEMBRO_1', N'MEMBRO_2', N'MEMBRO_3', N'MEMBRO_4', N'MEMBRO_5')
        GROUP BY OrgaoId, CargoOuFuncao HAVING COUNT(*) > 1) d;
    IF @repetidos > 0
        PRINT N'AVISO migração 127: índice UX_Assentos_CargoAtivo NÃO criado — há ' + CAST(@repetidos AS NVARCHAR(12))
            + N' cargo(s) fixo(s) com mais de um ocupante ativo em Assentos. Encerre as cadeiras repetidas (tela de Órgãos) e o próximo deploy cria o índice sozinho (consulta de conferência no cabeçalho da migração).';
    ELSE
    BEGIN
        BEGIN TRY
            CREATE UNIQUE INDEX UX_Assentos_CargoAtivo ON dbo.Assentos (OrgaoId, CargoOuFuncao)
                WHERE DataFim IS NULL
                  AND CargoOuFuncao IN (N'PRESIDENTE', N'VICE_PRESIDENTE_1', N'VICE_PRESIDENTE_2', N'VICE_PRESIDENTE_3', N'VICE_PRESIDENTE_4',
                                        N'SECRETARIO_1', N'SECRETARIO_2', N'SECRETARIO_3', N'TESOUREIRO_1', N'TESOUREIRO_2',
                                        N'TITULAR_1', N'TITULAR_2', N'TITULAR_3', N'TITULAR_4', N'TITULAR_5', N'TITULAR_6', N'TITULAR_7',
                                        N'SUPLENTE_1', N'SUPLENTE_2', N'SUPLENTE_3', N'MEMBRO_1', N'MEMBRO_2', N'MEMBRO_3', N'MEMBRO_4', N'MEMBRO_5');
        END TRY
        BEGIN CATCH
            PRINT N'AVISO migração 127: índice UX_Assentos_CargoAtivo NÃO criado — ' + ERROR_MESSAGE();
        END CATCH
    END
END
GO

DECLARE @repetidos INT;
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UX_ComissaoMembros_Ativo' AND object_id = OBJECT_ID(N'dbo.ComissaoMembros'))
BEGIN
    SELECT @repetidos = COUNT(*) FROM (SELECT 1 AS x FROM dbo.ComissaoMembros WHERE DataFim IS NULL GROUP BY Sigla, MembroId HAVING COUNT(*) > 1) d;
    IF @repetidos > 0
        PRINT N'AVISO migração 127: índice UX_ComissaoMembros_Ativo NÃO criado — há ' + CAST(@repetidos AS NVARCHAR(12))
            + N' pessoa(s) ativa(s) mais de uma vez na mesma comissão em ComissaoMembros. Encerre as repetições (tela de Órgãos) e o próximo deploy cria o índice sozinho (consulta de conferência no cabeçalho da migração).';
    ELSE
    BEGIN
        BEGIN TRY
            CREATE UNIQUE INDEX UX_ComissaoMembros_Ativo ON dbo.ComissaoMembros (Sigla, MembroId) WHERE DataFim IS NULL;
        END TRY
        BEGIN CATCH
            PRINT N'AVISO migração 127: índice UX_ComissaoMembros_Ativo NÃO criado — ' + ERROR_MESSAGE();
        END CATCH
    END
END
GO
