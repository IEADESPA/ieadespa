-- ============================================================
-- Migração 034 — v2.8 (correção): Enquetes viram formulário com múltiplas
-- perguntas (Enquete = formulário, PerguntasEnquete = cada questão dele,
-- RespostasEnquete = resposta por pergunta por pessoa).
--
-- DROPA e recria Enquetes/OpcoesEnquete/VotosEnquete/PublicoEnqueteCustom
-- (migração 032) de propósito — essas tabelas foram criadas minutos antes
-- desta, no mesmo dia, sem nenhum dado real de igreja registrado ainda.
-- Não é o padrão do projeto (normalmente só ALTER, nunca apagar dado real),
-- mas aqui não existe dado real a preservar.
-- Idempotente: seguro para reexecutar sem apagar dados (dali em diante).
-- ============================================================

IF EXISTS (SELECT 1 FROM sys.objects WHERE object_id = OBJECT_ID(N'dbo.VotosEnquete') AND type = N'U')
    DROP TABLE dbo.VotosEnquete;
GO
IF EXISTS (SELECT 1 FROM sys.objects WHERE object_id = OBJECT_ID(N'dbo.OpcoesEnquete') AND type = N'U')
    DROP TABLE dbo.OpcoesEnquete;
GO
IF EXISTS (SELECT 1 FROM sys.objects WHERE object_id = OBJECT_ID(N'dbo.PublicoEnqueteCustom') AND type = N'U')
    DROP TABLE dbo.PublicoEnqueteCustom;
GO
IF EXISTS (SELECT 1 FROM sys.objects WHERE object_id = OBJECT_ID(N'dbo.Enquetes') AND type = N'U')
    DROP TABLE dbo.Enquetes;
GO

CREATE TABLE dbo.Enquetes (
    EnqueteId         INT IDENTITY PRIMARY KEY,
    Titulo            NVARCHAR(200) NOT NULL,
    Descricao         NVARCHAR(1000) NULL,
    Visibilidade      NVARCHAR(20) NOT NULL DEFAULT 'SECRETA',     -- PUBLICA | SECRETA
    PublicoTipo       NVARCHAR(20) NOT NULL DEFAULT 'TODOS_ATIVOS',-- TODOS_ATIVOS | LISTA_CUSTOM
    Vinculante        BIT NOT NULL DEFAULT 0,
    QuorumTipo        NVARCHAR(30) NULL,     -- MAIORIA_SIMPLES | DOIS_TERCOS | NOVENTA_POR_CENTO (só se Vinculante)
    OrgaoId           INT NULL REFERENCES dbo.Orgaos(OrgaoId),
    SessaoId          INT NULL REFERENCES dbo.Sessoes(SessaoId),
    Status            NVARCHAR(20) NOT NULL DEFAULT 'ABERTA',      -- ABERTA | ENCERRADA
    ResultadoAprovado BIT NULL,
    CriadoPor         INT NULL REFERENCES dbo.MembroReferencia(MembroId),
    DataAbertura      DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    DataFechamento    DATETIME2 NULL
);
GO

CREATE TABLE dbo.PerguntasEnquete (
    PerguntaId  INT IDENTITY PRIMARY KEY,
    EnqueteId   INT NOT NULL REFERENCES dbo.Enquetes(EnqueteId),
    Ordem       INT NOT NULL DEFAULT 1,
    Titulo      NVARCHAR(300) NOT NULL,
    Tipo        NVARCHAR(20) NOT NULL DEFAULT 'OPCOES'  -- OPCOES | TEXTO_LIVRE
);
GO

CREATE TABLE dbo.OpcoesEnquete (
    OpcaoId    INT IDENTITY PRIMARY KEY,
    PerguntaId INT NOT NULL REFERENCES dbo.PerguntasEnquete(PerguntaId),
    Texto      NVARCHAR(300) NOT NULL
);
GO

CREATE TABLE dbo.PublicoEnqueteCustom (          -- só usado se PublicoTipo = LISTA_CUSTOM
    EnqueteId  INT NOT NULL REFERENCES dbo.Enquetes(EnqueteId),
    MembroId   INT NOT NULL REFERENCES dbo.MembroReferencia(MembroId),
    PRIMARY KEY (EnqueteId, MembroId)
);
GO

CREATE TABLE dbo.RespostasEnquete (
    RespostaId    INT IDENTITY PRIMARY KEY,
    PerguntaId    INT NOT NULL REFERENCES dbo.PerguntasEnquete(PerguntaId),
    MembroId      INT NOT NULL REFERENCES dbo.MembroReferencia(MembroId),
    OpcaoId       INT NULL REFERENCES dbo.OpcoesEnquete(OpcaoId),
    TextoResposta NVARCHAR(500) NULL,
    DataResposta  DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    CONSTRAINT UQ_RespostasEnquete_UmaPorPergunta UNIQUE (PerguntaId, MembroId)
);
GO
