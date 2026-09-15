-- ============================================================
-- Migração 085 — Acesso: delegação, sessão e revisão periódica (vB.9)
--
-- DelegacoesAcesso: "vou viajar, o 2º Secretário responde por mim" sem
-- emprestar senha (o que hoje destrói a auditoria — a ação fica registrada
-- na pessoa errada). O delegado continua logando com a PRÓPRIA matrícula;
-- a sessão dele só passa a somar a permissão+escopo do papel delegado, por
-- um prazo definido (shared/delegacoes.js).
--
-- SessoesAtivas: trilha de sessão (dispositivo, criação, último acesso) +
-- suporte a "encerrar sessão". Limitação real, documentada: o modelo de
-- autenticação (shared/auth.js) é stateless de propósito (token HMAC
-- assinado, validado sem tocar o banco) — mudar isso pra checar revogação
-- em TODA requisição exigiria tornar `exigirLogin` assíncrono e tocar as
-- ~140 Functions que o chamam hoje sem `await`, risco desproporcional pra
-- esta versão. Por isso "encerrar sessão" marca a sessão como encerrada
-- pra fins de trilha/painel, mas o token em si continua válido até expirar
-- sozinho (12h, já curto) — registrado como limitação conhecida no README,
-- não escondida.
--
-- Idempotente: seguro para reexecutar sem apagar dados.
-- ============================================================

IF OBJECT_ID(N'dbo.DelegacoesAcesso', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.DelegacoesAcesso (
        DelegacaoId         INT IDENTITY PRIMARY KEY,
        LiderancaId          INT NOT NULL REFERENCES dbo.Lideranca(LiderancaId),
        DeleganteMembroId     INT NOT NULL REFERENCES dbo.MembroReferencia(MembroId),
        DelegadoMembroId      INT NOT NULL REFERENCES dbo.MembroReferencia(MembroId),
        DataInicio            DATE NOT NULL,
        DataFim               DATE NOT NULL,
        Motivo                NVARCHAR(300) NULL,
        Status                NVARCHAR(20) NOT NULL DEFAULT 'ATIVA', -- ATIVA | CANCELADA
        CriadoEm              DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
        CONSTRAINT CHK_Delegacao_Prazo CHECK (DataFim >= DataInicio)
    );
    CREATE INDEX IX_DelegacoesAcesso_Delegado ON dbo.DelegacoesAcesso (DelegadoMembroId, Status, DataInicio, DataFim);
END
GO

IF OBJECT_ID(N'dbo.SessoesAtivas', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.SessoesAtivas (
        SessaoId          UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID() PRIMARY KEY,
        MembroId           INT NOT NULL REFERENCES dbo.MembroReferencia(MembroId),
        DispositivoInfo    NVARCHAR(300) NULL,
        CriadoEm           DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
        UltimoAcessoEm     DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
        Encerrada          BIT NOT NULL DEFAULT 0,
        EncerradaEm        DATETIME2 NULL
    );
    CREATE INDEX IX_SessoesAtivas_Membro ON dbo.SessoesAtivas (MembroId, CriadoEm DESC);
END
GO
