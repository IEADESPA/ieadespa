-- ============================================================
-- Migração 118 — Acesso do membro por PIN de 4 dígitos (fecho da v7.5)
--
-- Até aqui o "Meu Painel" do membro comum entrava só com a matrícula (sem senha, sem token), e as rotas de autoatendimento
-- tratavam o número da matrícula na URL como a própria pessoa. Agora toda rota de autoatendimento exige sessão, e a
-- sessão do membro nasce de um PIN de 4 dígitos que ele mesmo cria (a primeira vez, confirmando o e-mail cadastrado) ou
-- que a Secretaria gera como PIN provisório para quem não tem e-mail.
--
--   MembroPins        o PIN (nunca em texto: scrypt com sal e o segredo do sistema), se é provisório e até quando vale
--   AcessoTentativas  o contador de erros por pessoa e canal (PIN do membro, senha da liderança), com bloqueio que cresce
--   CodigosAcessoMembro.Tentativas  quantas vezes erraram o código de 6 dígitos do e-mail (o código queima no limite)
--
-- Idempotente: seguro para reexecutar sem apagar dados.
-- ============================================================

IF OBJECT_ID(N'dbo.MembroPins', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.MembroPins (
        MembroId             INT NOT NULL CONSTRAINT PK_MembroPins PRIMARY KEY REFERENCES dbo.MembroReferencia(MembroId),
        PinHash              NVARCHAR(200) NOT NULL,
        Provisorio           BIT NOT NULL CONSTRAINT DF_MembroPins_Prov DEFAULT 0,     -- gerado pela Secretaria: a pessoa precisa trocar ao entrar
        ProvisorioExpiraEm   DATETIME2 NULL,                                            -- PIN provisório vale por 7 dias
        DefinidoPorMembroId  INT NULL REFERENCES dbo.MembroReferencia(MembroId),        -- quem gerou o provisório (Secretaria); nulo = a própria pessoa
        CriadoEm             DATETIME2 NOT NULL CONSTRAINT DF_MembroPins_Criado DEFAULT SYSUTCDATETIME(),
        AtualizadoEm         DATETIME2 NOT NULL CONSTRAINT DF_MembroPins_Atual DEFAULT SYSUTCDATETIME(),
        CONSTRAINT CK_MembroPins_Provisorio CHECK ((Provisorio = 0 AND ProvisorioExpiraEm IS NULL) OR (Provisorio = 1 AND ProvisorioExpiraEm IS NOT NULL AND DefinidoPorMembroId IS NOT NULL))
    );
END
GO

IF OBJECT_ID(N'dbo.AcessoTentativas', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.AcessoTentativas (
        MembroId       INT NOT NULL REFERENCES dbo.MembroReferencia(MembroId),
        Canal          NVARCHAR(10) NOT NULL CONSTRAINT CK_AcessoTentativas_Canal CHECK (Canal IN ('PIN', 'SENHA', 'CODIGO')),
        Falhas         INT NOT NULL CONSTRAINT DF_AcessoTentativas_Falhas DEFAULT 0,
        BloqueadoAte   DATETIME2 NULL,
        UltimaFalhaEm  DATETIME2 NULL,
        CONSTRAINT PK_AcessoTentativas PRIMARY KEY (MembroId, Canal)
    );
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.CodigosAcessoMembro') AND name = N'Tentativas')
    ALTER TABLE dbo.CodigosAcessoMembro ADD Tentativas INT NOT NULL CONSTRAINT DF_CodigosAcessoMembro_Tent DEFAULT 0;
GO
