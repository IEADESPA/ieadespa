-- ============================================================
-- Migração 082 — Portal do membro: login simplificado + push (vB.5)
--
-- Login simplificado: "Meu Painel" hoje só confia em quem digita a
-- matrícula (autoatendimento fraco — qualquer um que souber o número de
-- alguém age em nome dela) ou em quem tem senha de Lideranca (pensado pra
-- quem administra, não pro membro comum). CodigosAcessoMembro é o mesmo
-- padrão que a "Minha Conta" do site já usa (Fase 26,
-- site/api/SolicitarCodigoConta): código de 6 dígitos por e-mail, curto,
-- hash nunca texto puro — só que aqui o destinatário é MembroReferencia
-- (matrícula real), não uma conta solta no Directus.
--
-- Push: PushInscricoesMembro guarda a inscrição (endpoint + chaves) de
-- cada dispositivo que a pessoa instalou o PWA e autorizou notificação.
-- CanalPush em NotificacaoRegras (vB.2, migração 079) é o 3º canal
-- possível por regra — junto de CanalEmail, sem WhatsApp ainda (decisão
-- da vB.2 continua de pé, é custo de API paga, independente de canal).
--
-- Idempotente: seguro para reexecutar sem apagar dados.
-- ============================================================

IF OBJECT_ID(N'dbo.CodigosAcessoMembro', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.CodigosAcessoMembro (
        CodigoId    INT IDENTITY PRIMARY KEY,
        MembroId     INT NOT NULL REFERENCES dbo.MembroReferencia(MembroId),
        CodigoHash   NVARCHAR(64) NOT NULL,
        ExpiraEm     DATETIME2 NOT NULL,
        Usado        BIT NOT NULL DEFAULT 0,
        CriadoEm     DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
    );
    CREATE INDEX IX_CodigosAcessoMembro_Membro ON dbo.CodigosAcessoMembro (MembroId, CriadoEm DESC);
END
GO

IF OBJECT_ID(N'dbo.PushInscricoesMembro', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.PushInscricoesMembro (
        InscricaoId  INT IDENTITY PRIMARY KEY,
        MembroId      INT NOT NULL REFERENCES dbo.MembroReferencia(MembroId),
        Endpoint      NVARCHAR(500) NOT NULL,
        P256dh        NVARCHAR(200) NOT NULL,
        Auth          NVARCHAR(100) NOT NULL,
        CriadoEm      DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
        CONSTRAINT UQ_PushInscricao_Endpoint UNIQUE (Endpoint)
    );
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.NotificacaoRegras') AND name = N'CanalPush')
    ALTER TABLE dbo.NotificacaoRegras ADD CanalPush BIT NOT NULL DEFAULT 0;
GO
