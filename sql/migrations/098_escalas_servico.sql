-- ============================================================
-- Migração 098 — v5.6: Escalas de serviço com auto-escalador
--
-- A v7.5 já previa "escala de rodízio voluntário", mas a grade sozinha não
-- resolve o problema real: o que hoje vira corrente de WhatsApp e o
-- secretário refazendo tudo na mão é "fulano avisou que não pode" e
-- "fulano recusou, quem chama agora?". Este módulo nasce direto com
-- indisponibilidade declarada, troca entre voluntários, auto-escalador
-- (última vez que serviu + frequência preferida), convite em cadeia e
-- confirmação de recebimento — não só a grade básica.
--
-- Decisão de arquitetura (avaliada e documentada, não pulada): o motor
-- genérico de workflow (shared/workflow.js, vB.3) resolve responsável por
-- PERMISSÃO + NÍVEL TERRITORIAL (Congregação..Global). Aprovação de troca
-- de escala é resolvida por LÍDER DA EQUIPE — uma pessoa concreta amarrada
-- à Equipe, não a um nível territorial/permissão — então não há
-- ResponsavelNivelMinimo que sirva; forçar isso no motor genérico exigiria
-- inventar um "nível" fictício por equipe, pior que não reusar. Por isso
-- EscalasTrocas tem seu próprio Status (PENDENTE/APROVADA/RECUSADA), mas
-- REUSA o motor de notificações (shared/notificacaoMotor.js, vB.2) pros
-- avisos de convite em cadeia e pendência de confirmação — a parte do
-- princípio "não recodar o mesmo fluxo" que de fato se aplica aqui.
--
-- Idempotente: seguro para reexecutar sem apagar dados.
-- ============================================================

IF OBJECT_ID(N'dbo.EscalasEquipes', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.EscalasEquipes (
        EquipeId        INT IDENTITY PRIMARY KEY,
        Nome            NVARCHAR(100) NOT NULL,          -- ex: 'Louvor', 'Recepção'
        CongregacaoId   INT NOT NULL REFERENCES dbo.Congregacoes(CongregacaoId),
        LiderMembroId   INT NOT NULL REFERENCES dbo.MembroReferencia(MembroId),
        Ativa           BIT NOT NULL DEFAULT 1,
        CriadaEm        DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
    );
END
GO

IF OBJECT_ID(N'dbo.EscalasEquipeMembros', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.EscalasEquipeMembros (
        EquipeMembroId          INT IDENTITY PRIMARY KEY,
        EquipeId                INT NOT NULL REFERENCES dbo.EscalasEquipes(EquipeId),
        MembroId                INT NOT NULL REFERENCES dbo.MembroReferencia(MembroId),
        -- "uma vez por mês" etc, em dias — o auto-escalador só considera o
        -- voluntário elegível de novo depois desse intervalo desde o último
        -- serviço (nunca serviu = elegível imediatamente).
        FrequenciaPreferidaDias INT NOT NULL DEFAULT 30,
        Ativo                   BIT NOT NULL DEFAULT 1,
        CriadoEm                DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
        CONSTRAINT UQ_EscalaEquipeMembro UNIQUE (EquipeId, MembroId)
    );
END
GO

IF OBJECT_ID(N'dbo.EscalasServicos', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.EscalasServicos (
        ServicoId           INT IDENTITY PRIMARY KEY,
        CongregacaoId       INT NOT NULL REFERENCES dbo.Congregacoes(CongregacaoId),
        DataHora            DATETIME2 NOT NULL,
        Descricao           NVARCHAR(200) NULL,          -- ex: 'Culto de Domingo à Noite'
        -- RASCUNHO: auto-escalador já pode ter rodado, mas ninguém foi
        -- avisado ainda. PUBLICADA: voluntários notificados, prazo de
        -- confirmação correndo. CANCELADA: serviço caiu.
        Status              NVARCHAR(20) NOT NULL DEFAULT 'RASCUNHO',
        PublicadaEm         DATETIME2 NULL,
        PrazoConfirmacaoDias INT NOT NULL DEFAULT 3,
        CriadoPorMembroId   INT NULL REFERENCES dbo.MembroReferencia(MembroId),
        CriadoEm            DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
    );
END
GO

IF OBJECT_ID(N'dbo.EscalasAlocacoes', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.EscalasAlocacoes (
        AlocacaoId      INT IDENTITY PRIMARY KEY,
        ServicoId       INT NOT NULL REFERENCES dbo.EscalasServicos(ServicoId),
        EquipeId        INT NOT NULL REFERENCES dbo.EscalasEquipes(EquipeId),
        MembroId        INT NOT NULL REFERENCES dbo.MembroReferencia(MembroId),
        -- CONVIDADO -> ACEITO -> CONFIRMADO (recebimento confirmado) ou
        -- RECUSADO (dispara convite em cadeia pro próximo da fila) ou
        -- CANCELADA (troca aprovada tirou essa pessoa do posto).
        Status          NVARCHAR(20) NOT NULL DEFAULT 'CONVIDADO',
        OrdemConvite    INT NOT NULL DEFAULT 1,          -- posição na fila de convite em cadeia daquele posto
        ConvidadoEm     DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
        RespondidoEm    DATETIME2 NULL,
        ConfirmadoEm    DATETIME2 NULL,
        CONSTRAINT UQ_EscalaAlocacao UNIQUE (ServicoId, EquipeId, MembroId)
    );
END
GO

IF OBJECT_ID(N'dbo.EscalasIndisponibilidades', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.EscalasIndisponibilidades (
        IndisponibilidadeId INT IDENTITY PRIMARY KEY,
        MembroId             INT NOT NULL REFERENCES dbo.MembroReferencia(MembroId),
        DataInicio           DATE NOT NULL,
        DataFim              DATE NOT NULL,
        Motivo               NVARCHAR(200) NULL,          -- viagem, trabalho, período livre
        CriadaEm             DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
    );
END
GO

IF OBJECT_ID(N'dbo.EscalasTrocas', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.EscalasTrocas (
        TrocaId               INT IDENTITY PRIMARY KEY,
        AlocacaoOrigemId      INT NOT NULL REFERENCES dbo.EscalasAlocacoes(AlocacaoId),
        MembroDestinoId       INT NOT NULL REFERENCES dbo.MembroReferencia(MembroId),
        SolicitadaPorMembroId INT NOT NULL REFERENCES dbo.MembroReferencia(MembroId),
        Status                NVARCHAR(20) NOT NULL DEFAULT 'PENDENTE', -- PENDENTE/APROVADA/RECUSADA
        ObservacaoLider       NVARCHAR(300) NULL,
        DecididaPorMembroId   INT NULL REFERENCES dbo.MembroReferencia(MembroId),
        DecididaEm            DATETIME2 NULL,
        CriadaEm              DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
    );
END
GO

-- Motor de notificações (vB.2) — 2 regras novas com detector próprio
-- (shared/notificacaoDetectores.js::detectarConviteCadeiaPendente /
-- detectarConfirmacaoEscalaPendente). PermissaoAlvo 'escalas' cobre quem
-- administra escalas (Presidente/Secretário Geral/líder equivalente);
-- pendência de confirmação é sobre "vira pendência do líder da equipe" —
-- o detector resolve o líder específico da equipe, não por permissão
-- ampla, então essas 2 regras usam a mesma tabela mas o destinatário real
-- vem do próprio fato gerador (ver notificacaoDetectores.js).
IF NOT EXISTS (SELECT 1 FROM dbo.NotificacaoRegras WHERE Chave = N'ESCALA_CONVITE_CADEIA')
    INSERT INTO dbo.NotificacaoRegras (Chave, Titulo, Categoria, PermissaoAlvo, NivelAlvo, CanalEmail)
    VALUES (N'ESCALA_CONVITE_CADEIA', N'Convite de escala em cadeia', N'ESCALAS', N'escalas', NULL, 1);
GO

IF NOT EXISTS (SELECT 1 FROM dbo.NotificacaoRegras WHERE Chave = N'ESCALA_CONFIRMACAO_PENDENTE')
    INSERT INTO dbo.NotificacaoRegras (Chave, Titulo, Categoria, PermissaoAlvo, NivelAlvo, CanalEmail)
    VALUES (N'ESCALA_CONFIRMACAO_PENDENTE', N'Confirmação de escala pendente', N'ESCALAS', N'escalas', NULL, 1);
GO
