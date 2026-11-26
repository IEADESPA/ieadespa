-- ============================================================
-- Migração 179 — JUNTAR FICHAS REPETIDAS e as PENDÊNCIAS DE CADASTRO (FASE 10, v10.1b passo 6, 18/11/2026)
--
-- Decisões do responsável (rodada 8 da gestão de membros e 13/11/2026):
--  - a tela mostra SÓ o que é diferente entre as duas fichas e a secretaria escolhe, campo a campo, o que fica (opção 3);
--  - fica SEMPRE a matrícula mais antiga; o número que sobra vai para o PRÓXIMO cadastro novo (MatriculasLivres, da 174), sem buraco na numeração;
--  - a impressão da carteirinha FÍSICA fica bloqueada enquanto a ficha tiver pendência de cadastro (ficha repetida, número a acertar): nunca sai
--    carteirinha física com o número de duas pessoas;
--  - alerta antes da assembleia geral: não abrir com cadastro repetido ou errado pendente.
--  - o escopo é o do CPF repetido: dentro da congregação ou da área de quem junta; fora disso, só a Secretaria Geral.
--
-- O que nasce aqui:
--  - FichasPendencias: as pendências de cadastro de uma ficha. Tipo REPETIDA (pode ser a mesma pessoa de OutroMembroId), NUMERO (a matrícula precisa ser
--    acertada — ex.: veio repetida ou zerada da planilha do sistema antigo) e ARROLAMENTO (situação, cargo, data e forma de entrada a completar — os importados
--    entram assim, sem direito a voto até completar). Situacao ABERTA | RESOLVIDA. Resolucao: JUNTADA | NAO_E_A_MESMA | CORRIGIDA | COMPLETADA.
--    Uma pendência ABERTA por ficha, tipo e outra ficha (o índice único filtrado).
--  - JuncoesFichas: o registro de cada junção — quem ficou, quem saiu, quem juntou e quando, os campos escolhidos, as linhas movidas de cada tabela (para
--    conferir e desfazer) e a ficha que saiu (para desfazer; apagada da linha depois de 30 dias ou na exclusão LGPD de quem ficou). Sem chave estrangeira nas
--    matrículas: o número que saiu deixa de existir e pode ser dado a outra pessoa — o registro é histórico.
--  - JuncoesFichasArquivo: as linhas que não cabiam na ficha que ficou (a mesma presença na mesma reunião, a mesma resposta na mesma pergunta...): guardadas
--    aqui, inteiras, para conferir e desfazer; apagadas junto com a ficha que saiu (30 dias ou exclusão LGPD).
-- Idempotente: seguro para reexecutar sem apagar dados.
-- ============================================================

IF OBJECT_ID(N'dbo.FichasPendencias', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.FichasPendencias (
        PendenciaId     INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_FichasPendencias PRIMARY KEY,
        MembroId        INT NOT NULL CONSTRAINT FK_FichasPendencias_Membro REFERENCES dbo.MembroReferencia(MembroId),
        Tipo            NVARCHAR(12) NOT NULL,
        OutroMembroId   INT NULL CONSTRAINT FK_FichasPendencias_Outro REFERENCES dbo.MembroReferencia(MembroId),
        Detalhe         NVARCHAR(300) NULL,
        Origem          NVARCHAR(12) NOT NULL CONSTRAINT DF_FichasPendencias_Origem DEFAULT N'MARCADA',
        Situacao        NVARCHAR(10) NOT NULL CONSTRAINT DF_FichasPendencias_Situacao DEFAULT N'ABERTA',
        AbertaEm        DATETIME2(0) NOT NULL CONSTRAINT DF_FichasPendencias_AbertaEm DEFAULT SYSUTCDATETIME(),
        AbertaPor       INT NULL,
        ResolvidaEm     DATETIME2(0) NULL,
        ResolvidaPor    INT NULL,
        Resolucao       NVARCHAR(14) NULL,
        Nota            NVARCHAR(300) NULL,
        CONSTRAINT CK_FichasPendencias_Tipo CHECK (Tipo IS NOT NULL AND Tipo IN (N'REPETIDA', N'NUMERO', N'ARROLAMENTO')),
        CONSTRAINT CK_FichasPendencias_Origem CHECK (Origem IS NOT NULL AND Origem IN (N'MARCADA', N'IMPORTACAO', N'CADASTRO', N'JUNCAO')),
        CONSTRAINT CK_FichasPendencias_Situacao CHECK (Situacao IS NOT NULL AND Situacao IN (N'ABERTA', N'RESOLVIDA')),
        CONSTRAINT CK_FichasPendencias_Resolucao CHECK ((Situacao = N'ABERTA' AND Resolucao IS NULL AND ResolvidaEm IS NULL)
            OR (Situacao = N'RESOLVIDA' AND Resolucao IS NOT NULL AND Resolucao IN (N'JUNTADA', N'NAO_E_A_MESMA', N'CORRIGIDA', N'COMPLETADA') AND ResolvidaEm IS NOT NULL)),
        -- (a dupla resolvida pela junção fica com as duas pontas na ficha que ficou: por isso o "diferente" vale só para a aberta)
        CONSTRAINT CK_FichasPendencias_Outro CHECK ((Tipo = N'REPETIDA' AND OutroMembroId IS NOT NULL AND (Situacao = N'RESOLVIDA' OR OutroMembroId <> MembroId))
            OR (Tipo <> N'REPETIDA' AND OutroMembroId IS NULL))
    );
END
GO
-- Uma pendência ABERTA por ficha, tipo e outra ficha (marcar de novo a mesma dupla não cria outra)
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UX_FichasPendencias_Aberta' AND object_id = OBJECT_ID(N'dbo.FichasPendencias'))
    CREATE UNIQUE INDEX UX_FichasPendencias_Aberta ON dbo.FichasPendencias (MembroId, Tipo, OutroMembroId) WHERE Situacao = N'ABERTA';
GO
-- O que a tela lê: as abertas por tipo (o painel, a lista de fichas repetidas, o alerta da assembleia) e as da outra ficha (a dupla)
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_FichasPendencias_Situacao' AND object_id = OBJECT_ID(N'dbo.FichasPendencias'))
    CREATE INDEX IX_FichasPendencias_Situacao ON dbo.FichasPendencias (Situacao, Tipo) INCLUDE (MembroId, OutroMembroId);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_FichasPendencias_Outro' AND object_id = OBJECT_ID(N'dbo.FichasPendencias'))
    CREATE INDEX IX_FichasPendencias_Outro ON dbo.FichasPendencias (OutroMembroId) WHERE OutroMembroId IS NOT NULL;
GO

IF OBJECT_ID(N'dbo.JuncoesFichas', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.JuncoesFichas (
        JuncaoId          INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_JuncoesFichas PRIMARY KEY,
        MatriculaFica     INT NOT NULL,              -- a ficha que ficou (a mais antiga)
        MatriculaSai      INT NOT NULL,              -- a ficha que deixou de existir (o número foi para MatriculasLivres)
        JuntadaEm         DATETIME2(0) NOT NULL CONSTRAINT DF_JuncoesFichas_JuntadaEm DEFAULT SYSUTCDATETIME(),
        JuntadaPor        INT NOT NULL,
        Escopo            NVARCHAR(10) NOT NULL,     -- LOCAL | AREA | GERAL (quem juntou)
        Escolhas          NVARCHAR(MAX) NULL,        -- JSON: { campo: "FICA" | "SAI" } (só os campos diferentes)
        FichaFicaAntes    NVARCHAR(MAX) NULL,        -- JSON: os campos da ficha que ficou ANTES (para desfazer; o CPF nunca aqui)
        FichaFicaDepois   NVARCHAR(MAX) NULL,        -- JSON: os mesmos campos DEPOIS (desfazer só se ninguém mexeu depois)
        FichaSai          NVARCHAR(MAX) NULL,        -- JSON: a linha inteira da ficha que saiu (para desfazer); NULL depois de 30 dias / exclusão LGPD
        Movimentos        NVARCHAR(MAX) NULL,        -- JSON: [{ t: tabela, c: coluna, k: [chaves das linhas movidas] }]
        Resumo            NVARCHAR(MAX) NULL,        -- JSON: as contagens por tabela (para conferir), sem dado pessoal
        Situacao          NVARCHAR(10) NOT NULL CONSTRAINT DF_JuncoesFichas_Situacao DEFAULT N'FEITA',
        DesfeitaEm        DATETIME2(0) NULL,
        DesfeitaPor       INT NULL,
        MotivoDesfazer    NVARCHAR(300) NULL,
        ArquivoApagadoEm  DATETIME2(0) NULL,
        CONSTRAINT CK_JuncoesFichas_Situacao CHECK (Situacao IS NOT NULL AND Situacao IN (N'FEITA', N'DESFEITA')),
        CONSTRAINT CK_JuncoesFichas_Escopo CHECK (Escopo IS NOT NULL AND Escopo IN (N'LOCAL', N'AREA', N'GERAL')),
        CONSTRAINT CK_JuncoesFichas_Numeros CHECK (MatriculaFica > 0 AND MatriculaSai > 0 AND MatriculaFica <> MatriculaSai),
        CONSTRAINT CK_JuncoesFichas_Desfeita CHECK ((Situacao = N'FEITA' AND DesfeitaEm IS NULL) OR (Situacao = N'DESFEITA' AND DesfeitaEm IS NOT NULL AND DesfeitaPor IS NOT NULL))
    );
END
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_JuncoesFichas_Fica' AND object_id = OBJECT_ID(N'dbo.JuncoesFichas'))
    CREATE INDEX IX_JuncoesFichas_Fica ON dbo.JuncoesFichas (MatriculaFica) INCLUDE (Situacao, JuntadaEm);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_JuncoesFichas_Sai' AND object_id = OBJECT_ID(N'dbo.JuncoesFichas'))
    CREATE INDEX IX_JuncoesFichas_Sai ON dbo.JuncoesFichas (MatriculaSai) INCLUDE (Situacao, JuntadaEm);
GO

IF OBJECT_ID(N'dbo.JuncoesFichasArquivo', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.JuncoesFichasArquivo (
        ArquivoId   INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_JuncoesFichasArquivo PRIMARY KEY,
        JuncaoId    INT NOT NULL CONSTRAINT FK_JuncoesFichasArquivo_Juncao REFERENCES dbo.JuncoesFichas(JuncaoId),
        Tabela      NVARCHAR(128) NOT NULL,
        Linha       NVARCHAR(MAX) NOT NULL       -- JSON da linha inteira (FOR JSON PATH, INCLUDE_NULL_VALUES)
    );
END
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_JuncoesFichasArquivo_Juncao' AND object_id = OBJECT_ID(N'dbo.JuncoesFichasArquivo'))
    CREATE INDEX IX_JuncoesFichasArquivo_Juncao ON dbo.JuncoesFichasArquivo (JuncaoId);
GO
