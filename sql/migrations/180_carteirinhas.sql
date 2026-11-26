-- ============================================================
-- Migração 180 — AS CARTEIRINHAS (FASE 10, v10.1b passo 8, 19/11/2026)
--
-- Decisões do responsável (rodadas 9 a 11 da gestão de membros, 13 e 14/11/2026):
--  - duas carteirinhas: a FÍSICA (papel e PVC), feita por um MODELO que a Secretaria Geral desenha no editor, só com o que não muda (nome, nascimento,
--    foto, matrícula, pai e mãe); e a DIGITAL, com o que muda (congregação, cargo, função, situação). O cargo tem de aparecer;
--  - vários modelos (membro, congregado, obreiro...), frente e verso, tamanho do cartão, arte de fundo em alta resolução; o modelo sai sozinho pelo tipo da pessoa;
--  - UM QR POR PESSOA, PARA SEMPRE: nunca vence nem muda, o mesmo na física e na digital; o que muda é o que a página de conferência mostra ao ler;
--  - a impressão da física fica bloqueada enquanto a ficha tiver pendência REPETIDA ou NUMERO (migração 179); vai direto para a impressora, nenhum arquivo
--    fica guardado.
--
-- O que nasce aqui:
--  - CarteirinhaModelos: os modelos da física. Desenho = o JSON do editor (as camadas da frente e do verso, as cores, o tamanho), conferido por
--    api/shared/carteirinha.js antes de gravar. ArteFrente/ArteVerso = o endereço da arte de fundo no armazenamento (container privado de documentos).
--    Um modelo ATIVO por público (MEMBRO, CONGREGADO, OBREIRO); os de público OUTRO não saem sozinhos. Versao (rowversion) para não gravar por cima.
--  - CarteirinhasQr: o código do QR de cada pessoa (um por pessoa, para sempre). Nasce na primeira vez que a carteirinha é vista ou impressa. A chave é o
--    CÓDIGO: juntando fichas, os códigos da ficha que sai passam para a que fica (o cartão já impresso das duas continua valendo, da mesma pessoa); o cartão
--    novo sai sempre com o código mais antigo.
--  - CarteirinhasImpressas: o registro de cada impressão (quem, qual modelo, o tipo da pessoa naquela hora, o material), para saber quem já tem a sua e
--    quem precisa de uma nova (entrou, mudou de tipo, pediu segunda via). Nenhum dado pessoal além da matrícula.
--  - CarteirinhasPedidos: os pedidos de segunda via (perdeu, estragou), atendidos na próxima impressão.
-- Quem desenhou (CriadoPor, AtualizadoPor, ImpressaPor, PedidoPor) fica sem chave estrangeira: é registro histórico, como em FichasPendencias.
-- Idempotente: seguro para reexecutar sem apagar dados.
-- ============================================================

IF OBJECT_ID(N'dbo.CarteirinhaModelos', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.CarteirinhaModelos (
        ModeloId        INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_CarteirinhaModelos PRIMARY KEY,
        Nome            NVARCHAR(60) NOT NULL,
        Publico         NVARCHAR(12) NOT NULL,
        Desenho         NVARCHAR(MAX) NOT NULL,
        ArteFrente      NVARCHAR(400) NULL,
        ArteVerso       NVARCHAR(400) NULL,
        Ativo           BIT NOT NULL CONSTRAINT DF_CarteirinhaModelos_Ativo DEFAULT 1,
        CriadoEm        DATETIME2(0) NOT NULL CONSTRAINT DF_CarteirinhaModelos_CriadoEm DEFAULT SYSUTCDATETIME(),
        CriadoPor       INT NULL,
        AtualizadoEm    DATETIME2(0) NULL,
        AtualizadoPor   INT NULL,
        Versao          ROWVERSION NOT NULL,
        CONSTRAINT CK_CarteirinhaModelos_Publico CHECK (Publico IN (N'MEMBRO', N'CONGREGADO', N'OBREIRO', N'OUTRO')),
        CONSTRAINT CK_CarteirinhaModelos_Nome CHECK (LEN(LTRIM(RTRIM(Nome))) > 0),
        CONSTRAINT CK_CarteirinhaModelos_Desenho CHECK (ISJSON(Desenho) = 1)
    );
END
GO

-- um modelo ativo por público (o que sai sozinho pelo tipo da pessoa); OUTRO pode ter vários
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UX_CarteirinhaModelos_PublicoAtivo' AND object_id = OBJECT_ID(N'dbo.CarteirinhaModelos'))
    CREATE UNIQUE INDEX UX_CarteirinhaModelos_PublicoAtivo ON dbo.CarteirinhaModelos (Publico) WHERE Ativo = 1 AND Publico <> N'OUTRO';
GO

IF OBJECT_ID(N'dbo.CarteirinhasQr', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.CarteirinhasQr (
        Codigo          NVARCHAR(20) NOT NULL CONSTRAINT PK_CarteirinhasQr PRIMARY KEY,
        MembroId        INT NOT NULL CONSTRAINT FK_CarteirinhasQr_Membro REFERENCES dbo.MembroReferencia(MembroId),
        CriadoEm        DATETIME2(0) NOT NULL CONSTRAINT DF_CarteirinhasQr_CriadoEm DEFAULT SYSUTCDATETIME(),
        CONSTRAINT CK_CarteirinhasQr_Codigo CHECK (LEN(Codigo) >= 12)
    );
END
GO

-- a primeira forma desta tabela (19/11/2026, só num banco de teste) tinha a chave em MembroId: converte para a chave no código
IF EXISTS (SELECT 1 FROM sys.indexes i JOIN sys.index_columns ic ON ic.object_id = i.object_id AND ic.index_id = i.index_id
           JOIN sys.columns c ON c.object_id = ic.object_id AND c.column_id = ic.column_id
           WHERE i.object_id = OBJECT_ID(N'dbo.CarteirinhasQr') AND i.is_primary_key = 1 AND c.name = N'MembroId')
BEGIN
    ALTER TABLE dbo.CarteirinhasQr DROP CONSTRAINT PK_CarteirinhasQr;
    IF EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UX_CarteirinhasQr_Codigo' AND object_id = OBJECT_ID(N'dbo.CarteirinhasQr'))
        DROP INDEX UX_CarteirinhasQr_Codigo ON dbo.CarteirinhasQr;
    ALTER TABLE dbo.CarteirinhasQr ADD CONSTRAINT PK_CarteirinhasQr PRIMARY KEY (Codigo);
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_CarteirinhasQr_Membro' AND object_id = OBJECT_ID(N'dbo.CarteirinhasQr'))
    CREATE INDEX IX_CarteirinhasQr_Membro ON dbo.CarteirinhasQr (MembroId, CriadoEm);
GO

IF OBJECT_ID(N'dbo.CarteirinhasImpressas', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.CarteirinhasImpressas (
        ImpressaoId     INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_CarteirinhasImpressas PRIMARY KEY,
        MembroId        INT NOT NULL CONSTRAINT FK_CarteirinhasImpressas_Membro REFERENCES dbo.MembroReferencia(MembroId),
        ModeloId        INT NOT NULL CONSTRAINT FK_CarteirinhasImpressas_Modelo REFERENCES dbo.CarteirinhaModelos(ModeloId),
        Publico         NVARCHAR(12) NOT NULL,
        Material        NVARCHAR(5) NOT NULL,
        FrenteVerso     BIT NOT NULL,
        Motivo          NVARCHAR(12) NOT NULL,
        CongregacaoId   INT NULL,
        ImpressaEm      DATETIME2(0) NOT NULL CONSTRAINT DF_CarteirinhasImpressas_Em DEFAULT SYSUTCDATETIME(),
        ImpressaPor     INT NOT NULL,
        CONSTRAINT CK_CarteirinhasImpressas_Publico CHECK (Publico IN (N'MEMBRO', N'CONGREGADO', N'OBREIRO', N'OUTRO')),
        CONSTRAINT CK_CarteirinhasImpressas_Material CHECK (Material IN (N'PAPEL', N'PVC')),
        CONSTRAINT CK_CarteirinhasImpressas_Motivo CHECK (Motivo IN (N'NOVA', N'MUDOU', N'SEGUNDA_VIA', N'REIMPRESSAO'))
    );
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_CarteirinhasImpressas_Membro' AND object_id = OBJECT_ID(N'dbo.CarteirinhasImpressas'))
    CREATE INDEX IX_CarteirinhasImpressas_Membro ON dbo.CarteirinhasImpressas (MembroId, ImpressaEm DESC) INCLUDE (Publico);
GO

IF OBJECT_ID(N'dbo.CarteirinhasPedidos', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.CarteirinhasPedidos (
        PedidoId        INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_CarteirinhasPedidos PRIMARY KEY,
        MembroId        INT NOT NULL CONSTRAINT FK_CarteirinhasPedidos_Membro REFERENCES dbo.MembroReferencia(MembroId),
        Motivo          NVARCHAR(120) NOT NULL,
        PedidoEm        DATETIME2(0) NOT NULL CONSTRAINT DF_CarteirinhasPedidos_Em DEFAULT SYSUTCDATETIME(),
        PedidoPor       INT NOT NULL,
        AtendidoEm      DATETIME2(0) NULL,
        ImpressaoId     INT NULL CONSTRAINT FK_CarteirinhasPedidos_Impressao REFERENCES dbo.CarteirinhasImpressas(ImpressaoId)
    );
END
GO

-- um pedido de segunda via aberto por pessoa (pedir de novo não duplica)
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UX_CarteirinhasPedidos_Aberto' AND object_id = OBJECT_ID(N'dbo.CarteirinhasPedidos'))
    CREATE UNIQUE INDEX UX_CarteirinhasPedidos_Aberto ON dbo.CarteirinhasPedidos (MembroId) WHERE AtendidoEm IS NULL;
GO
