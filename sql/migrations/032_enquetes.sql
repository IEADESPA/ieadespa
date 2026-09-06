-- ============================================================
-- Migração 032 — v2.8 (Parte A): Enquetes (não-vinculantes + vinculante)
-- Pautas que nascem e se resolvem fora de uma sessão formal (Tema do Ano,
-- camiseta de festa) + modo Vinculante pra eleições/reformas quando o
-- cenário for contestado (ver README v2.8 pra racional completo).
-- Idempotente: seguro para reexecutar sem apagar dados.
-- ============================================================

IF NOT EXISTS (SELECT 1 FROM sys.objects WHERE object_id = OBJECT_ID(N'dbo.Enquetes') AND type = N'U')
BEGIN
    CREATE TABLE dbo.Enquetes (
        EnqueteId         INT IDENTITY PRIMARY KEY,
        Titulo            NVARCHAR(200) NOT NULL,
        Descricao         NVARCHAR(1000) NULL,
        Tipo              NVARCHAR(20) NOT NULL DEFAULT 'OPCOES',       -- OPCOES | TEXTO_LIVRE
        Visibilidade      NVARCHAR(20) NOT NULL DEFAULT 'SECRETA',      -- PUBLICA | SECRETA
        PublicoTipo       NVARCHAR(20) NOT NULL DEFAULT 'TODOS_ATIVOS', -- TODOS_ATIVOS | LISTA_CUSTOM
        Vinculante        BIT NOT NULL DEFAULT 0,
        QuorumTipo        NVARCHAR(30) NULL,     -- MAIORIA_SIMPLES | DOIS_TERCOS | NOVENTA_POR_CENTO
        OrgaoId           INT NULL REFERENCES dbo.Orgaos(OrgaoId),
        SessaoId          INT NULL REFERENCES dbo.Sessoes(SessaoId),
        Status            NVARCHAR(20) NOT NULL DEFAULT 'ABERTA',       -- ABERTA | ENCERRADA
        ResultadoAprovado BIT NULL,
        CriadoPor         INT NULL REFERENCES dbo.MembroReferencia(MembroId),
        DataAbertura      DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
        DataFechamento    DATETIME2 NULL
    );
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.objects WHERE object_id = OBJECT_ID(N'dbo.OpcoesEnquete') AND type = N'U')
BEGIN
    CREATE TABLE dbo.OpcoesEnquete (
        OpcaoId    INT IDENTITY PRIMARY KEY,
        EnqueteId  INT NOT NULL REFERENCES dbo.Enquetes(EnqueteId),
        Texto      NVARCHAR(300) NOT NULL
    );
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.objects WHERE object_id = OBJECT_ID(N'dbo.PublicoEnqueteCustom') AND type = N'U')
BEGIN
    CREATE TABLE dbo.PublicoEnqueteCustom (
        EnqueteId  INT NOT NULL REFERENCES dbo.Enquetes(EnqueteId),
        MembroId   INT NOT NULL REFERENCES dbo.MembroReferencia(MembroId),
        PRIMARY KEY (EnqueteId, MembroId)
    );
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.objects WHERE object_id = OBJECT_ID(N'dbo.VotosEnquete') AND type = N'U')
BEGIN
    CREATE TABLE dbo.VotosEnquete (
        VotoId         INT IDENTITY PRIMARY KEY,
        EnqueteId      INT NOT NULL REFERENCES dbo.Enquetes(EnqueteId),
        MembroId       INT NOT NULL REFERENCES dbo.MembroReferencia(MembroId),
        OpcaoId        INT NULL REFERENCES dbo.OpcoesEnquete(OpcaoId),
        TextoResposta  NVARCHAR(500) NULL,
        DataVoto       DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
        CONSTRAINT UQ_VotosEnquete_UmPorPessoa UNIQUE (EnqueteId, MembroId)
    );
END
GO
