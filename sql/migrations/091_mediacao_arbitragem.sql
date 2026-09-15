-- ============================================================
-- Migração 091 — Mediação e Arbitragem Eclesiástica (vB.16, Reg. Art. 161-A)
--
-- A FASE 3 inteira parte de "conflito interno vira processo disciplinar" —
-- certo pra falta ética/doutrinária, mas o Regimento também prevê uma via
-- pra disputa patrimonial/administrativa ENTRE PARTES (sem réu, sem
-- sanção). Hoje isso ou é forçado dentro do processo disciplinar (que
-- distorce, criando acusado onde não há acusação) ou sai do sistema. A
-- FASE 3 está fechada — este é módulo novo da FASE B, não reabertura.
--
-- CatalogoMediadoresArbitros: lista cadastrada de quem pode ser indicado —
-- entra no CRUD genérico de GestaoCatalogos (mesmo mecanismo de
-- departamentos/áreas/etc.), permissão dedicada "mediacao".
--
-- MediacoesArbitragens: 1 linha por caso. Sequência travada pelo sistema —
-- arbitragem só abre com Status = MEDIACAO_SEM_ACORDO (Art. 161-A e Lei
-- 9.307/1996). ParteA/ParteB aceitam matrícula OU descrição livre
-- (congregação/departamento não é MembroReferencia) — mesmo padrão "membro
-- OU nome livre" que Casamentos já usa pro cônjuge.
--
-- SessoesMediacao: comparecimento por sessão.
--
-- DenunciasOuvidoria ganha um ponteiro pra mediação (mesmo padrão de
-- ProcessoDisciplinarId, já existente) — segunda saída da Ouvidoria além
-- de "encaminhar processo".
--
-- Idempotente: seguro para reexecutar sem apagar dados.
-- ============================================================

IF OBJECT_ID(N'dbo.CatalogoMediadoresArbitros', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.CatalogoMediadoresArbitros (
        MediadorArbitroId  INT IDENTITY PRIMARY KEY,
        MembroId           INT NOT NULL REFERENCES dbo.MembroReferencia(MembroId),
        Papel              NVARCHAR(20) NOT NULL,  -- MEDIADOR | ARBITRO | AMBOS
        Ativo              BIT NOT NULL DEFAULT 1,
        CriadoEm           DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
        CONSTRAINT UQ_CatalogoMediadoresArbitros_Membro UNIQUE (MembroId)
    );
END
GO

IF OBJECT_ID(N'dbo.MediacoesArbitragens', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.MediacoesArbitragens (
        MediacaoId                          INT IDENTITY PRIMARY KEY,
        Assunto                              NVARCHAR(500) NOT NULL,
        ParteAId                             INT NULL REFERENCES dbo.MembroReferencia(MembroId),
        ParteADescricao                      NVARCHAR(200) NULL,
        ParteBId                             INT NULL REFERENCES dbo.MembroReferencia(MembroId),
        ParteBDescricao                      NVARCHAR(200) NULL,
        ValorEnvolvido                       DECIMAL(12,2) NULL,
        PrazoDiasEncerramento                INT NOT NULL,
        Status                               NVARCHAR(30) NOT NULL DEFAULT 'MEDIACAO_EM_CURSO',
        -- MEDIACAO_EM_CURSO | MEDIACAO_ACORDO | MEDIACAO_SEM_ACORDO | ARBITRAGEM_EM_CURSO | ARBITRAGEM_SENTENCA
        InstauradoPor                        INT NOT NULL REFERENCES dbo.MembroReferencia(MembroId),
        DataInstauracao                      DATE NOT NULL DEFAULT CAST(SYSUTCDATETIME() AS DATE),
        MediadorId                           INT NULL REFERENCES dbo.MembroReferencia(MembroId),
        DataDesignacaoMediador               DATE NULL,
        DataEncerramentoMediacao             DATE NULL,
        TermoAcordoParteAAssinadoId          INT NULL REFERENCES dbo.TermosAssinados(TermoAssinadoId),
        TermoAcordoParteBAssinadoId          INT NULL REFERENCES dbo.TermosAssinados(TermoAssinadoId),
        SaidaVinculadaId                     INT NULL REFERENCES dbo.SaidasTesouraria(SaidaId),
        ArbitroId                            INT NULL REFERENCES dbo.MembroReferencia(MembroId),
        DataDesignacaoArbitro                DATE NULL,
        CompromissoArbitralParteAAssinadoId  INT NULL REFERENCES dbo.TermosAssinados(TermoAssinadoId),
        CompromissoArbitralParteBAssinadoId  INT NULL REFERENCES dbo.TermosAssinados(TermoAssinadoId),
        SentencaArbitralUrl                  NVARCHAR(500) NULL,
        DataSentencaArbitral                 DATE NULL,
        ProcessoDisciplinarBifurcadoId       INT NULL REFERENCES dbo.ProcessosDisciplinares(ProcessoId),
        CriadoEm                             DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
        CONSTRAINT CK_MediacoesArbitragens_ParteA CHECK (ParteAId IS NOT NULL OR ParteADescricao IS NOT NULL),
        CONSTRAINT CK_MediacoesArbitragens_ParteB CHECK (ParteBId IS NOT NULL OR ParteBDescricao IS NOT NULL)
    );
END
GO

IF OBJECT_ID(N'dbo.SessoesMediacao', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.SessoesMediacao (
        SessaoMediacaoId  INT IDENTITY PRIMARY KEY,
        MediacaoId        INT NOT NULL REFERENCES dbo.MediacoesArbitragens(MediacaoId),
        DataSessao        DATE NOT NULL,
        ParteACompareceu  BIT NULL,
        ParteBCompareceu  BIT NULL,
        Observacoes       NVARCHAR(500) NULL,
        CriadoEm          DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
    );
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.DenunciasOuvidoria') AND name = 'MediacaoArbitragemId')
    ALTER TABLE dbo.DenunciasOuvidoria ADD MediacaoArbitragemId INT NULL REFERENCES dbo.MediacoesArbitragens(MediacaoId);
GO

IF NOT EXISTS (SELECT 1 FROM dbo.Funcionalidades WHERE Chave = 'mediacao')
    INSERT INTO dbo.Funcionalidades (Chave, Nome) VALUES ('mediacao', 'Mediação e Arbitragem Eclesiástica');
GO
