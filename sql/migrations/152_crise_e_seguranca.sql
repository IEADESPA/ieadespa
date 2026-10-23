-- ============================================================
-- Migração 152 — v7.15: Gestão de crise e porta-voz único (Regimento Art. 161-B) e segurança da congregação (plano de emergência, simulados, vistoria predial,
-- equipe de segurança). Contrato de 23/10/2026 (docs/plano/fase-7-saude-eventos-e-comunicacao.md, "## v7.15").
--
--   1) CriseRegimes: o regime de crise. Só UM ativo por vez (índice único filtrado); quem ordenou (o Presidente), quem registrou, o motivo, o alcance (todo o Campo), o
--      Porta-Voz Único (o próprio Presidente ou o profissional designado, com nome, contato e o ato da designação), quando abriu e quando encerrou. Não se apaga; o motivo e
--      quem ordenou não mudam; encerrado não muda mais nada (gatilho).
--   2) CriseHistorico: o que aconteceu com cada crise (aberta, porta-voz designado, encerrada), com a fotografia do porta-voz da hora e o aviso que saiu. Só acrescenta.
--   3) CriseManifestacoes: as manifestações autorizadas (data e hora, canal, quem falou, resumo, link ou documento, quem autorizou). Só acrescenta (correção = linha nova que
--      aponta a corrigida; cada linha é corrigida uma vez só, para a corrente ficar em fila).
--   4) CriseDemandasImprensa e CriseDemandaRespostas: o pedido da imprensa que chegou a um líder (veículo, contato, pedido, prazo) e a resposta (respondida pelo porta-voz ou
--      recusada). Só acrescenta; a primeira resposta é única e cada resposta é substituída uma vez só. O contato do jornalista sai na retenção (marca 'crise_purga').
--   5) SegurancaPlanos: o plano de emergência da congregação, em versões (cada revisão é uma versão nova; a data da última é a da revisão anual).
--   6) SegurancaSimulados, SegurancaVistorias e SegurancaVistoriaItens: os simulados e o checklist da vistoria predial, com as pendências. Não se editam; o registro errado é
--      ANULADO (uma vez, com o motivo) e a pendência é marcada como resolvida (uma vez, com o como).
--   7) SegurancaEquipe: a equipe de segurança da congregação (função, desde e até). Encerra uma vez; a pessoa só sai do registro pela retenção ou pela exclusão LGPD
--      (marca 'seguranca_purga').
--   8) a categoria CRISE na comunicação da v7.12 (o aviso da crise vai pela mesma fila de e-mail, que respeita os 100 por hora do Azure), as permissões crise_gestao e
--      seguranca_congregacao, os prazos, os avisos do sininho e a retenção.
--
-- Idempotente: seguro para reexecutar sem apagar dados.
-- ============================================================

-- ---- 1) O regime de crise ----

IF OBJECT_ID(N'dbo.CriseRegimes', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.CriseRegimes (
        CriseId                 INT IDENTITY PRIMARY KEY,
        Status                  NVARCHAR(10) NOT NULL CONSTRAINT DF_CriseRegimes_Status DEFAULT N'ATIVA'
                                    CONSTRAINT CK_CriseRegimes_Status CHECK (Status IS NOT NULL AND Status IN (N'ATIVA', N'ENCERRADA')),
        Motivo                  NVARCHAR(300) NOT NULL,
        Alcance                 NVARCHAR(10) NOT NULL CONSTRAINT DF_CriseRegimes_Alcance DEFAULT N'CAMPO'
                                    CONSTRAINT CK_CriseRegimes_Alcance CHECK (Alcance IS NOT NULL AND Alcance IN (N'CAMPO')),
        OrdenadoPorMembroId     INT NOT NULL REFERENCES dbo.MembroReferencia(MembroId),
        RegistradoPorMembroId   INT NOT NULL REFERENCES dbo.MembroReferencia(MembroId),
        PortaVozTipo            NVARCHAR(12) NOT NULL CONSTRAINT CK_CriseRegimes_PortaVozTipo CHECK (PortaVozTipo IS NOT NULL AND PortaVozTipo IN (N'PRESIDENTE', N'DESIGNADO')),
        PortaVozMembroId        INT NULL REFERENCES dbo.MembroReferencia(MembroId),
        PortaVozNome            NVARCHAR(150) NOT NULL,
        PortaVozContato         NVARCHAR(150) NOT NULL,
        DesignacaoAto           NVARCHAR(300) NULL,
        AbertaEm                DATETIME2 NOT NULL CONSTRAINT DF_CriseRegimes_AbertaEm DEFAULT SYSUTCDATETIME(),
        EncerradaEm             DATETIME2 NULL,
        EncerradaPorMembroId    INT NULL REFERENCES dbo.MembroReferencia(MembroId),
        ResumoEncerramento      NVARCHAR(500) NULL,
        -- o Presidente fala pela matrícula dele; o profissional designado precisa do ato formal da designação (§ 1º)
        CONSTRAINT CK_CriseRegimes_Presidente CHECK (PortaVozTipo <> N'PRESIDENTE' OR PortaVozMembroId IS NOT NULL),
        CONSTRAINT CK_CriseRegimes_Designado CHECK (PortaVozTipo <> N'DESIGNADO' OR (DesignacaoAto IS NOT NULL AND LEN(DesignacaoAto) >= 5)),
        CONSTRAINT CK_CriseRegimes_Textos CHECK (LEN(Motivo) >= 5 AND LEN(PortaVozNome) >= 3 AND LEN(PortaVozContato) >= 5),
        CONSTRAINT CK_CriseRegimes_Encerramento CHECK ((Status = N'ATIVA' AND EncerradaEm IS NULL AND EncerradaPorMembroId IS NULL AND ResumoEncerramento IS NULL)
            OR (Status = N'ENCERRADA' AND EncerradaEm IS NOT NULL AND EncerradaPorMembroId IS NOT NULL AND EncerradaEm >= AbertaEm))
    );
END
GO
-- Uma crise ativa por vez: o banco recusa a segunda, mesmo que duas pessoas abram no mesmo instante.
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UX_CriseRegimes_UmaAtiva' AND object_id = OBJECT_ID(N'dbo.CriseRegimes'))
    CREATE UNIQUE INDEX UX_CriseRegimes_UmaAtiva ON dbo.CriseRegimes (Status) WHERE Status = N'ATIVA';
GO
-- Não se apaga. O motivo, quem ordenou, quem registrou, o alcance e a abertura não mudam. Ativa: muda o porta-voz (designação) ou encerra; encerrada: não muda mais nada.
EXEC(N'CREATE OR ALTER TRIGGER dbo.TR_CriseRegimes_Protegido ON dbo.CriseRegimes AFTER UPDATE, DELETE AS
BEGIN
    SET NOCOUNT ON;
    IF NOT EXISTS (SELECT 1 FROM inserted)
    BEGIN
        IF EXISTS (SELECT 1 FROM deleted)
        BEGIN
            RAISERROR(N''O regime de crise não se apaga: o histórico fica.'', 16, 1);
            ROLLBACK TRANSACTION;
        END
        RETURN;
    END
    IF EXISTS (SELECT 1 FROM inserted i JOIN deleted d ON d.CriseId = i.CriseId
        WHERE i.Motivo <> d.Motivo OR i.Alcance <> d.Alcance OR i.OrdenadoPorMembroId <> d.OrdenadoPorMembroId OR i.RegistradoPorMembroId <> d.RegistradoPorMembroId
           OR i.AbertaEm <> d.AbertaEm OR d.Status = N''ENCERRADA''
           OR (i.Status = N''ENCERRADA'' AND (i.PortaVozTipo <> d.PortaVozTipo OR ISNULL(i.PortaVozMembroId, -1) <> ISNULL(d.PortaVozMembroId, -1)
               OR i.PortaVozNome <> d.PortaVozNome OR i.PortaVozContato <> d.PortaVozContato OR ISNULL(i.DesignacaoAto, N'''') <> ISNULL(d.DesignacaoAto, N''''))))
    BEGIN
        RAISERROR(N''O regime de crise só muda o porta-voz enquanto está ativo e só se encerra uma vez.'', 16, 1);
        ROLLBACK TRANSACTION;
    END
END');
GO

-- ---- 2) O histórico da crise ----

IF OBJECT_ID(N'dbo.CriseHistorico', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.CriseHistorico (
        HistoricoId             INT IDENTITY PRIMARY KEY,
        CriseId                 INT NOT NULL REFERENCES dbo.CriseRegimes(CriseId),
        Evento                  NVARCHAR(12) NOT NULL CONSTRAINT CK_CriseHistorico_Evento CHECK (Evento IS NOT NULL AND Evento IN (N'ABERTA', N'PORTA_VOZ', N'ENCERRADA')),
        PortaVozTipo            NVARCHAR(12) NOT NULL CONSTRAINT CK_CriseHistorico_PortaVozTipo CHECK (PortaVozTipo IS NOT NULL AND PortaVozTipo IN (N'PRESIDENTE', N'DESIGNADO')),
        PortaVozMembroId        INT NULL REFERENCES dbo.MembroReferencia(MembroId),
        PortaVozNome            NVARCHAR(150) NOT NULL,
        PortaVozContato         NVARCHAR(150) NOT NULL,
        DesignacaoAto           NVARCHAR(300) NULL,
        Texto                   NVARCHAR(500) NULL,                -- o motivo na abertura; o resumo no encerramento
        MembroId                INT NOT NULL REFERENCES dbo.MembroReferencia(MembroId),
        EnvioId                 INT NULL REFERENCES dbo.ComunicacaoEnvios(EnvioId),
        Em                      DATETIME2 NOT NULL CONSTRAINT DF_CriseHistorico_Em DEFAULT SYSUTCDATETIME()
    );
END
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UX_CriseHistorico_Abertura' AND object_id = OBJECT_ID(N'dbo.CriseHistorico'))
    CREATE UNIQUE INDEX UX_CriseHistorico_Abertura ON dbo.CriseHistorico (CriseId) WHERE Evento = N'ABERTA';
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UX_CriseHistorico_Encerramento' AND object_id = OBJECT_ID(N'dbo.CriseHistorico'))
    CREATE UNIQUE INDEX UX_CriseHistorico_Encerramento ON dbo.CriseHistorico (CriseId) WHERE Evento = N'ENCERRADA';
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_CriseHistorico_Crise' AND object_id = OBJECT_ID(N'dbo.CriseHistorico'))
    CREATE INDEX IX_CriseHistorico_Crise ON dbo.CriseHistorico (CriseId, HistoricoId);
GO
EXEC(N'CREATE OR ALTER TRIGGER dbo.TR_CriseHistorico_Imutavel ON dbo.CriseHistorico AFTER UPDATE, DELETE AS
BEGIN
    SET NOCOUNT ON;
    IF EXISTS (SELECT 1 FROM deleted)
    BEGIN
        RAISERROR(N''O histórico da crise não se edita nem se apaga.'', 16, 1);
        ROLLBACK TRANSACTION;
    END
END');
GO

-- ---- 3) As manifestações autorizadas ----

IF OBJECT_ID(N'dbo.CriseManifestacoes', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.CriseManifestacoes (
        ManifestacaoId          INT IDENTITY PRIMARY KEY,
        CriseId                 INT NOT NULL REFERENCES dbo.CriseRegimes(CriseId),
        DataHora                DATETIME2 NOT NULL,
        Canal                   NVARCHAR(12) NOT NULL CONSTRAINT CK_CriseManifestacoes_Canal CHECK (Canal IS NOT NULL AND Canal IN (N'NOTA', N'ENTREVISTA', N'REDE_SOCIAL', N'COLETIVA')),
        QuemFalou               NVARCHAR(150) NOT NULL,
        Resumo                  NVARCHAR(2000) NOT NULL,
        Link                    NVARCHAR(500) NULL,
        Documento               NVARCHAR(300) NULL,
        AutorizadoPor           NVARCHAR(150) NOT NULL,
        CorrigeManifestacaoId   INT NULL REFERENCES dbo.CriseManifestacoes(ManifestacaoId),
        RegistradoPorMembroId   INT NOT NULL REFERENCES dbo.MembroReferencia(MembroId),
        RegistradoEm            DATETIME2 NOT NULL CONSTRAINT DF_CriseManifestacoes_RegistradoEm DEFAULT SYSUTCDATETIME(),
        CONSTRAINT CK_CriseManifestacoes_Textos CHECK (LEN(QuemFalou) >= 3 AND LEN(Resumo) >= 10 AND LEN(AutorizadoPor) >= 3),
        CONSTRAINT CK_CriseManifestacoes_Link CHECK (Link IS NULL OR Link LIKE N'https://%' OR Link LIKE N'http://%')
    );
END
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UX_CriseManifestacoes_Correcao' AND object_id = OBJECT_ID(N'dbo.CriseManifestacoes'))
    CREATE UNIQUE INDEX UX_CriseManifestacoes_Correcao ON dbo.CriseManifestacoes (CorrigeManifestacaoId) WHERE CorrigeManifestacaoId IS NOT NULL;
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_CriseManifestacoes_Crise' AND object_id = OBJECT_ID(N'dbo.CriseManifestacoes'))
    CREATE INDEX IX_CriseManifestacoes_Crise ON dbo.CriseManifestacoes (CriseId, ManifestacaoId);
GO
-- Só acrescenta; a correção aponta uma linha da MESMA crise.
EXEC(N'CREATE OR ALTER TRIGGER dbo.TR_CriseManifestacoes_Imutavel ON dbo.CriseManifestacoes AFTER INSERT, UPDATE, DELETE AS
BEGIN
    SET NOCOUNT ON;
    IF EXISTS (SELECT 1 FROM deleted)
    BEGIN
        RAISERROR(N''A manifestação registrada não se edita nem se apaga: a correção é uma linha nova.'', 16, 1);
        ROLLBACK TRANSACTION;
        RETURN;
    END
    IF EXISTS (SELECT 1 FROM inserted i JOIN dbo.CriseManifestacoes c ON c.ManifestacaoId = i.CorrigeManifestacaoId WHERE c.CriseId <> i.CriseId)
    BEGIN
        RAISERROR(N''A correção aponta uma manifestação da mesma crise.'', 16, 1);
        ROLLBACK TRANSACTION;
    END
END');
GO

-- ---- 4) As demandas de imprensa e as respostas ----

IF OBJECT_ID(N'dbo.CriseDemandasImprensa', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.CriseDemandasImprensa (
        DemandaId               INT IDENTITY PRIMARY KEY,
        CriseId                 INT NULL REFERENCES dbo.CriseRegimes(CriseId),    -- a crise ativa quando chegou (a demanda fora de crise também se centraliza)
        Veiculo                 NVARCHAR(150) NOT NULL,
        Contato                 NVARCHAR(150) NULL,
        Pedido                  NVARCHAR(2000) NOT NULL,
        PrazoEm                 DATETIME2 NULL,
        CorrigeDemandaId        INT NULL REFERENCES dbo.CriseDemandasImprensa(DemandaId),
        RegistradoPorMembroId   INT NOT NULL REFERENCES dbo.MembroReferencia(MembroId),
        RecebidaEm              DATETIME2 NOT NULL CONSTRAINT DF_CriseDemandasImprensa_RecebidaEm DEFAULT SYSUTCDATETIME(),
        ContatoApagadoEm        DATETIME2 NULL,
        CONSTRAINT CK_CriseDemandasImprensa_Textos CHECK (LEN(Veiculo) >= 2 AND LEN(Pedido) >= 5),
        CONSTRAINT CK_CriseDemandasImprensa_Contato CHECK (Contato IS NOT NULL OR ContatoApagadoEm IS NOT NULL)
    );
END
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UX_CriseDemandasImprensa_Correcao' AND object_id = OBJECT_ID(N'dbo.CriseDemandasImprensa'))
    CREATE UNIQUE INDEX UX_CriseDemandasImprensa_Correcao ON dbo.CriseDemandasImprensa (CorrigeDemandaId) WHERE CorrigeDemandaId IS NOT NULL;
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_CriseDemandasImprensa_Registrante' AND object_id = OBJECT_ID(N'dbo.CriseDemandasImprensa'))
    CREATE INDEX IX_CriseDemandasImprensa_Registrante ON dbo.CriseDemandasImprensa (RegistradoPorMembroId, DemandaId);
GO
-- Não se apaga. A única mudança é a retenção apagar o contato do jornalista (com a marca 'crise_purga'); a correção aponta uma demanda da mesma crise.
EXEC(N'CREATE OR ALTER TRIGGER dbo.TR_CriseDemandasImprensa_Protegida ON dbo.CriseDemandasImprensa AFTER INSERT, UPDATE, DELETE AS
BEGIN
    SET NOCOUNT ON;
    IF NOT EXISTS (SELECT 1 FROM inserted)
    BEGIN
        IF EXISTS (SELECT 1 FROM deleted)
        BEGIN
            RAISERROR(N''A demanda de imprensa não se apaga.'', 16, 1);
            ROLLBACK TRANSACTION;
        END
        RETURN;
    END
    IF EXISTS (SELECT 1 FROM deleted)
    BEGIN
        IF ISNULL(CAST(SESSION_CONTEXT(N''crise_purga'') AS INT), 0) <> 1
           OR EXISTS (SELECT 1 FROM inserted i JOIN deleted d ON d.DemandaId = i.DemandaId
                WHERE ISNULL(i.CriseId, -1) <> ISNULL(d.CriseId, -1) OR i.Veiculo <> d.Veiculo OR i.Pedido <> d.Pedido OR ISNULL(i.PrazoEm, ''19000101'') <> ISNULL(d.PrazoEm, ''19000101'')
                   OR ISNULL(i.CorrigeDemandaId, -1) <> ISNULL(d.CorrigeDemandaId, -1) OR i.RegistradoPorMembroId <> d.RegistradoPorMembroId OR i.RecebidaEm <> d.RecebidaEm
                   OR i.Contato IS NOT NULL OR i.ContatoApagadoEm IS NULL OR (d.ContatoApagadoEm IS NOT NULL AND i.ContatoApagadoEm <> d.ContatoApagadoEm))
        BEGIN
            RAISERROR(N''A demanda registrada não se edita: a correção é uma linha nova.'', 16, 1);
            ROLLBACK TRANSACTION;
        END
        RETURN;
    END
    IF EXISTS (SELECT 1 FROM inserted i JOIN dbo.CriseDemandasImprensa c ON c.DemandaId = i.CorrigeDemandaId WHERE ISNULL(c.CriseId, -1) <> ISNULL(i.CriseId, -1))
    BEGIN
        RAISERROR(N''A correção aponta uma demanda da mesma crise.'', 16, 1);
        ROLLBACK TRANSACTION;
    END
END');
GO

IF OBJECT_ID(N'dbo.CriseDemandaRespostas', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.CriseDemandaRespostas (
        RespostaId              INT IDENTITY PRIMARY KEY,
        DemandaId               INT NOT NULL REFERENCES dbo.CriseDemandasImprensa(DemandaId),
        SubstituiRespostaId     INT NULL REFERENCES dbo.CriseDemandaRespostas(RespostaId),
        Situacao                NVARCHAR(10) NOT NULL CONSTRAINT CK_CriseDemandaRespostas_Situacao CHECK (Situacao IS NOT NULL AND Situacao IN (N'RESPONDIDA', N'RECUSADA')),
        Resposta                NVARCHAR(2000) NOT NULL,
        RespondidoPorMembroId   INT NOT NULL REFERENCES dbo.MembroReferencia(MembroId),
        Em                      DATETIME2 NOT NULL CONSTRAINT DF_CriseDemandaRespostas_Em DEFAULT SYSUTCDATETIME(),
        CONSTRAINT CK_CriseDemandaRespostas_Texto CHECK (LEN(Resposta) >= 5)
    );
END
GO
-- A primeira resposta de uma demanda é única; cada resposta é substituída uma vez só (a corrente fica em fila, nunca bifurca).
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UX_CriseDemandaRespostas_Primeira' AND object_id = OBJECT_ID(N'dbo.CriseDemandaRespostas'))
    CREATE UNIQUE INDEX UX_CriseDemandaRespostas_Primeira ON dbo.CriseDemandaRespostas (DemandaId) WHERE SubstituiRespostaId IS NULL;
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UX_CriseDemandaRespostas_Substitui' AND object_id = OBJECT_ID(N'dbo.CriseDemandaRespostas'))
    CREATE UNIQUE INDEX UX_CriseDemandaRespostas_Substitui ON dbo.CriseDemandaRespostas (SubstituiRespostaId) WHERE SubstituiRespostaId IS NOT NULL;
GO
EXEC(N'CREATE OR ALTER TRIGGER dbo.TR_CriseDemandaRespostas_Imutavel ON dbo.CriseDemandaRespostas AFTER INSERT, UPDATE, DELETE AS
BEGIN
    SET NOCOUNT ON;
    IF EXISTS (SELECT 1 FROM deleted)
    BEGIN
        RAISERROR(N''A resposta registrada não se edita nem se apaga: a correção é uma resposta nova.'', 16, 1);
        ROLLBACK TRANSACTION;
        RETURN;
    END
    IF EXISTS (SELECT 1 FROM inserted i JOIN dbo.CriseDemandaRespostas r ON r.RespostaId = i.SubstituiRespostaId WHERE r.DemandaId <> i.DemandaId)
    BEGIN
        RAISERROR(N''A resposta nova substitui uma resposta da mesma demanda.'', 16, 1);
        ROLLBACK TRANSACTION;
    END
END');
GO

-- ---- 5) O plano de emergência ----

IF OBJECT_ID(N'dbo.SegurancaPlanos', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.SegurancaPlanos (
        PlanoId                 INT IDENTITY PRIMARY KEY,
        CongregacaoId           INT NOT NULL REFERENCES dbo.Congregacoes(CongregacaoId),
        Versao                  INT NOT NULL CONSTRAINT CK_SegurancaPlanos_Versao CHECK (Versao >= 1),
        RotasEvacuacao          NVARCHAR(2000) NOT NULL,
        PontosEncontro          NVARCHAR(1000) NOT NULL,
        ContatosLocais          NVARCHAR(1000) NULL,
        Responsaveis            NVARCHAR(1000) NOT NULL,
        RegistradoPorMembroId   INT NOT NULL REFERENCES dbo.MembroReferencia(MembroId),
        RevisadoEm              DATETIME2 NOT NULL CONSTRAINT DF_SegurancaPlanos_RevisadoEm DEFAULT SYSUTCDATETIME(),
        CONSTRAINT UQ_SegurancaPlanos_Versao UNIQUE (CongregacaoId, Versao),
        CONSTRAINT CK_SegurancaPlanos_Textos CHECK (LEN(RotasEvacuacao) >= 10 AND LEN(PontosEncontro) >= 5 AND LEN(Responsaveis) >= 3)
    );
END
GO
EXEC(N'CREATE OR ALTER TRIGGER dbo.TR_SegurancaPlanos_Imutavel ON dbo.SegurancaPlanos AFTER UPDATE, DELETE AS
BEGIN
    SET NOCOUNT ON;
    IF EXISTS (SELECT 1 FROM deleted)
    BEGIN
        RAISERROR(N''A versão do plano de emergência não se edita nem se apaga: a revisão é uma versão nova.'', 16, 1);
        ROLLBACK TRANSACTION;
    END
END');
GO

-- ---- 6) Simulados e vistoria predial ----

IF OBJECT_ID(N'dbo.SegurancaSimulados', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.SegurancaSimulados (
        SimuladoId              INT IDENTITY PRIMARY KEY,
        CongregacaoId           INT NOT NULL REFERENCES dbo.Congregacoes(CongregacaoId),
        Data                    DATE NOT NULL,
        Tipo                    NVARCHAR(20) NOT NULL CONSTRAINT CK_SegurancaSimulados_Tipo CHECK (Tipo IS NOT NULL AND Tipo IN (N'EVACUACAO', N'INCENDIO', N'PRIMEIROS_SOCORROS', N'VIOLENCIA')),
        Participantes           INT NOT NULL CONSTRAINT CK_SegurancaSimulados_Participantes CHECK (Participantes BETWEEN 1 AND 100000),
        DuracaoMinutos          INT NOT NULL CONSTRAINT CK_SegurancaSimulados_Duracao CHECK (DuracaoMinutos BETWEEN 1 AND 1440),
        CorreuBem               NVARCHAR(1000) NULL,
        Melhorar                NVARCHAR(1000) NULL,
        RegistradoPorMembroId   INT NOT NULL REFERENCES dbo.MembroReferencia(MembroId),
        RegistradoEm            DATETIME2 NOT NULL CONSTRAINT DF_SegurancaSimulados_RegistradoEm DEFAULT SYSUTCDATETIME(),
        AnuladoEm               DATETIME2 NULL,
        AnuladoPorMembroId      INT NULL REFERENCES dbo.MembroReferencia(MembroId),
        MotivoAnulacao          NVARCHAR(300) NULL,
        CONSTRAINT CK_SegurancaSimulados_Anulacao CHECK ((AnuladoEm IS NULL AND AnuladoPorMembroId IS NULL AND MotivoAnulacao IS NULL)
            OR (AnuladoEm IS NOT NULL AND AnuladoPorMembroId IS NOT NULL AND MotivoAnulacao IS NOT NULL AND LEN(MotivoAnulacao) >= 5))
    );
END
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_SegurancaSimulados_Congregacao' AND object_id = OBJECT_ID(N'dbo.SegurancaSimulados'))
    CREATE INDEX IX_SegurancaSimulados_Congregacao ON dbo.SegurancaSimulados (CongregacaoId, Data DESC) WHERE AnuladoEm IS NULL;
GO
EXEC(N'CREATE OR ALTER TRIGGER dbo.TR_SegurancaSimulados_Protegido ON dbo.SegurancaSimulados AFTER UPDATE, DELETE AS
BEGIN
    SET NOCOUNT ON;
    IF NOT EXISTS (SELECT 1 FROM inserted)
    BEGIN
        IF EXISTS (SELECT 1 FROM deleted)
        BEGIN
            RAISERROR(N''O simulado registrado não se apaga (pode ser anulado, com o motivo).'', 16, 1);
            ROLLBACK TRANSACTION;
        END
        RETURN;
    END
    IF EXISTS (SELECT 1 FROM inserted i JOIN deleted d ON d.SimuladoId = i.SimuladoId
        WHERE d.AnuladoEm IS NOT NULL OR i.AnuladoEm IS NULL OR i.CongregacaoId <> d.CongregacaoId OR i.Data <> d.Data OR i.Tipo <> d.Tipo OR i.Participantes <> d.Participantes
           OR i.DuracaoMinutos <> d.DuracaoMinutos OR ISNULL(i.CorreuBem, N'''') <> ISNULL(d.CorreuBem, N'''') OR ISNULL(i.Melhorar, N'''') <> ISNULL(d.Melhorar, N'''')
           OR i.RegistradoPorMembroId <> d.RegistradoPorMembroId OR i.RegistradoEm <> d.RegistradoEm)
    BEGIN
        RAISERROR(N''O simulado registrado não se edita: só se anula, uma vez.'', 16, 1);
        ROLLBACK TRANSACTION;
    END
END');
GO

IF OBJECT_ID(N'dbo.SegurancaVistorias', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.SegurancaVistorias (
        VistoriaId              INT IDENTITY PRIMARY KEY,
        CongregacaoId           INT NOT NULL REFERENCES dbo.Congregacoes(CongregacaoId),
        Data                    DATE NOT NULL,
        Observacoes             NVARCHAR(1000) NULL,
        RegistradoPorMembroId   INT NOT NULL REFERENCES dbo.MembroReferencia(MembroId),
        RegistradoEm            DATETIME2 NOT NULL CONSTRAINT DF_SegurancaVistorias_RegistradoEm DEFAULT SYSUTCDATETIME(),
        AnuladoEm               DATETIME2 NULL,
        AnuladoPorMembroId      INT NULL REFERENCES dbo.MembroReferencia(MembroId),
        MotivoAnulacao          NVARCHAR(300) NULL,
        CONSTRAINT CK_SegurancaVistorias_Anulacao CHECK ((AnuladoEm IS NULL AND AnuladoPorMembroId IS NULL AND MotivoAnulacao IS NULL)
            OR (AnuladoEm IS NOT NULL AND AnuladoPorMembroId IS NOT NULL AND MotivoAnulacao IS NOT NULL AND LEN(MotivoAnulacao) >= 5))
    );
END
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_SegurancaVistorias_Congregacao' AND object_id = OBJECT_ID(N'dbo.SegurancaVistorias'))
    CREATE INDEX IX_SegurancaVistorias_Congregacao ON dbo.SegurancaVistorias (CongregacaoId, Data DESC) WHERE AnuladoEm IS NULL;
GO
EXEC(N'CREATE OR ALTER TRIGGER dbo.TR_SegurancaVistorias_Protegida ON dbo.SegurancaVistorias AFTER UPDATE, DELETE AS
BEGIN
    SET NOCOUNT ON;
    IF NOT EXISTS (SELECT 1 FROM inserted)
    BEGIN
        IF EXISTS (SELECT 1 FROM deleted)
        BEGIN
            RAISERROR(N''A vistoria registrada não se apaga (pode ser anulada, com o motivo).'', 16, 1);
            ROLLBACK TRANSACTION;
        END
        RETURN;
    END
    IF EXISTS (SELECT 1 FROM inserted i JOIN deleted d ON d.VistoriaId = i.VistoriaId
        WHERE d.AnuladoEm IS NOT NULL OR i.AnuladoEm IS NULL OR i.CongregacaoId <> d.CongregacaoId OR i.Data <> d.Data OR ISNULL(i.Observacoes, N'''') <> ISNULL(d.Observacoes, N'''')
           OR i.RegistradoPorMembroId <> d.RegistradoPorMembroId OR i.RegistradoEm <> d.RegistradoEm)
    BEGIN
        RAISERROR(N''A vistoria registrada não se edita: só se anula, uma vez.'', 16, 1);
        ROLLBACK TRANSACTION;
    END
END');
GO

IF OBJECT_ID(N'dbo.SegurancaVistoriaItens', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.SegurancaVistoriaItens (
        VistoriaItemId          INT IDENTITY PRIMARY KEY,
        VistoriaId              INT NOT NULL REFERENCES dbo.SegurancaVistorias(VistoriaId),
        Item                    NVARCHAR(30) NOT NULL CONSTRAINT CK_SegurancaVistoriaItens_Item CHECK (Item IS NOT NULL AND Item IN (N'EXTINTORES', N'SAIDAS', N'ILUMINACAO_EMERGENCIA',
                                    N'QUADRO_ELETRICO', N'ACESSIBILIDADE', N'SINALIZACAO', N'ALARME_INCENDIO', N'KIT_PRIMEIROS_SOCORROS', N'GAS', N'ESTRUTURA')),
        Resultado               NVARCHAR(14) NOT NULL CONSTRAINT CK_SegurancaVistoriaItens_Resultado CHECK (Resultado IS NOT NULL AND Resultado IN (N'OK', N'PENDENTE', N'NAO_SE_APLICA')),
        Pendencia               NVARCHAR(500) NULL,
        ResolvidaEm             DATETIME2 NULL,
        ResolvidaPorMembroId    INT NULL REFERENCES dbo.MembroReferencia(MembroId),
        ComoResolvida           NVARCHAR(500) NULL,
        CONSTRAINT UQ_SegurancaVistoriaItens_Item UNIQUE (VistoriaId, Item),
        CONSTRAINT CK_SegurancaVistoriaItens_Pendencia CHECK ((Resultado = N'PENDENTE' AND Pendencia IS NOT NULL AND LEN(Pendencia) >= 3) OR (Resultado <> N'PENDENTE' AND Pendencia IS NULL)),
        CONSTRAINT CK_SegurancaVistoriaItens_Resolucao CHECK ((ResolvidaEm IS NULL AND ResolvidaPorMembroId IS NULL AND ComoResolvida IS NULL)
            OR (Resultado = N'PENDENTE' AND ResolvidaEm IS NOT NULL AND ResolvidaPorMembroId IS NOT NULL AND ComoResolvida IS NOT NULL AND LEN(ComoResolvida) >= 3))
    );
END
GO
EXEC(N'CREATE OR ALTER TRIGGER dbo.TR_SegurancaVistoriaItens_Protegido ON dbo.SegurancaVistoriaItens AFTER UPDATE, DELETE AS
BEGIN
    SET NOCOUNT ON;
    IF NOT EXISTS (SELECT 1 FROM inserted)
    BEGIN
        IF EXISTS (SELECT 1 FROM deleted)
        BEGIN
            RAISERROR(N''O item da vistoria não se apaga.'', 16, 1);
            ROLLBACK TRANSACTION;
        END
        RETURN;
    END
    IF EXISTS (SELECT 1 FROM inserted i JOIN deleted d ON d.VistoriaItemId = i.VistoriaItemId
        WHERE d.ResolvidaEm IS NOT NULL OR i.ResolvidaEm IS NULL OR i.VistoriaId <> d.VistoriaId OR i.Item <> d.Item OR i.Resultado <> d.Resultado
           OR ISNULL(i.Pendencia, N'''') <> ISNULL(d.Pendencia, N''''))
    BEGIN
        RAISERROR(N''O item da vistoria não se edita: a pendência só se marca como resolvida, uma vez.'', 16, 1);
        ROLLBACK TRANSACTION;
    END
END');
GO

-- ---- 7) A equipe de segurança ----

IF OBJECT_ID(N'dbo.SegurancaEquipe', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.SegurancaEquipe (
        EquipeId                INT IDENTITY PRIMARY KEY,
        CongregacaoId           INT NOT NULL REFERENCES dbo.Congregacoes(CongregacaoId),
        MembroId                INT NULL REFERENCES dbo.MembroReferencia(MembroId),
        Funcao                  NVARCHAR(20) NOT NULL CONSTRAINT CK_SegurancaEquipe_Funcao CHECK (Funcao IS NOT NULL AND Funcao IN (N'COORDENACAO', N'BRIGADA', N'PRIMEIROS_SOCORROS',
                                    N'PORTARIA', N'ESTACIONAMENTO')),
        Desde                   DATE NOT NULL,
        Ate                     DATE NULL,
        RegistradoPorMembroId   INT NOT NULL REFERENCES dbo.MembroReferencia(MembroId),
        RegistradoEm            DATETIME2 NOT NULL CONSTRAINT DF_SegurancaEquipe_RegistradoEm DEFAULT SYSUTCDATETIME(),
        EncerradoEm             DATETIME2 NULL,
        EncerradoPorMembroId    INT NULL REFERENCES dbo.MembroReferencia(MembroId),
        MotivoEncerramento      NVARCHAR(20) NULL CONSTRAINT CK_SegurancaEquipe_Motivo CHECK (MotivoEncerramento IS NULL OR MotivoEncerramento IN (N'MANUAL', N'SAIU_DA_CONGREGACAO',
                                    N'DESLIGADO', N'PRAZO', N'EXCLUSAO_LGPD')),
        AnonimizadoEm           DATETIME2 NULL,
        CONSTRAINT CK_SegurancaEquipe_Periodo CHECK (Ate IS NULL OR Ate >= Desde),
        CONSTRAINT CK_SegurancaEquipe_Encerramento CHECK ((EncerradoEm IS NULL AND MotivoEncerramento IS NULL AND EncerradoPorMembroId IS NULL)
            OR (EncerradoEm IS NOT NULL AND MotivoEncerramento IS NOT NULL AND Ate IS NOT NULL)),
        CONSTRAINT CK_SegurancaEquipe_Anonimo CHECK (MembroId IS NOT NULL OR (AnonimizadoEm IS NOT NULL AND EncerradoEm IS NOT NULL))
    );
END
GO
-- A mesma pessoa não ocupa duas vezes a mesma função, ao mesmo tempo, na mesma congregação.
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UX_SegurancaEquipe_Ativo' AND object_id = OBJECT_ID(N'dbo.SegurancaEquipe'))
    CREATE UNIQUE INDEX UX_SegurancaEquipe_Ativo ON dbo.SegurancaEquipe (CongregacaoId, MembroId, Funcao) WHERE EncerradoEm IS NULL;
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_SegurancaEquipe_Membro' AND object_id = OBJECT_ID(N'dbo.SegurancaEquipe'))
    CREATE INDEX IX_SegurancaEquipe_Membro ON dbo.SegurancaEquipe (MembroId) WHERE MembroId IS NOT NULL;
GO
-- A congregação, a função, o "desde" e quem registrou não mudam. O encerramento acontece uma vez (o "até" muda só junto com ele) e não se desfaz. A pessoa só sai do
-- registro com a marca 'seguranca_purga' (retenção ou exclusão LGPD), sempre com o encerramento. Apagar, nunca.
EXEC(N'CREATE OR ALTER TRIGGER dbo.TR_SegurancaEquipe_Protegida ON dbo.SegurancaEquipe AFTER UPDATE, DELETE AS
BEGIN
    SET NOCOUNT ON;
    IF NOT EXISTS (SELECT 1 FROM inserted)
    BEGIN
        IF EXISTS (SELECT 1 FROM deleted)
        BEGIN
            RAISERROR(N''A composição da equipe de segurança não se apaga: o histórico fica.'', 16, 1);
            ROLLBACK TRANSACTION;
        END
        RETURN;
    END
    IF EXISTS (SELECT 1 FROM inserted i JOIN deleted d ON d.EquipeId = i.EquipeId
        WHERE i.CongregacaoId <> d.CongregacaoId OR i.Funcao <> d.Funcao OR i.Desde <> d.Desde OR i.RegistradoPorMembroId <> d.RegistradoPorMembroId OR i.RegistradoEm <> d.RegistradoEm
           OR (d.EncerradoEm IS NOT NULL AND (ISNULL(i.EncerradoEm, ''19000101'') <> d.EncerradoEm OR ISNULL(i.MotivoEncerramento, N'''') <> ISNULL(d.MotivoEncerramento, N'''')
               OR ISNULL(i.EncerradoPorMembroId, -1) <> ISNULL(d.EncerradoPorMembroId, -1) OR ISNULL(i.Ate, ''19000101'') <> ISNULL(d.Ate, ''19000101'')))
           OR (d.EncerradoEm IS NULL AND i.EncerradoEm IS NULL AND ISNULL(i.Ate, ''19000101'') <> ISNULL(d.Ate, ''19000101''))
           OR (d.AnonimizadoEm IS NOT NULL AND ISNULL(i.AnonimizadoEm, ''19000101'') <> d.AnonimizadoEm)
           OR (ISNULL(i.MembroId, -1) <> ISNULL(d.MembroId, -1)
               AND NOT (i.MembroId IS NULL AND i.AnonimizadoEm IS NOT NULL AND ISNULL(CAST(SESSION_CONTEXT(N''seguranca_purga'') AS INT), 0) = 1)))
    BEGIN
        RAISERROR(N''A composição da equipe de segurança só se encerra, uma vez; a pessoa só sai do registro pela retenção ou pela exclusão LGPD.'', 16, 1);
        ROLLBACK TRANSACTION;
    END
END');
GO

-- ---- 8) A categoria CRISE na comunicação (v7.12): o aviso da crise usa a mesma fila de e-mail ----

IF EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = N'CK_ComunicacaoModelos_Categoria' AND definition NOT LIKE N'%CRISE%')
    ALTER TABLE dbo.ComunicacaoModelos DROP CONSTRAINT CK_ComunicacaoModelos_Categoria;
IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = N'CK_ComunicacaoModelos_Categoria')
    ALTER TABLE dbo.ComunicacaoModelos ADD CONSTRAINT CK_ComunicacaoModelos_Categoria CHECK (Categoria IN (N'CONVOCACAO', N'EVENTOS', N'DEVOCIONAL', N'FINANCEIRO', N'CRISE'));
GO
IF EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = N'CK_ComunicacaoEnvios_Categoria' AND definition NOT LIKE N'%CRISE%')
    ALTER TABLE dbo.ComunicacaoEnvios DROP CONSTRAINT CK_ComunicacaoEnvios_Categoria;
IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = N'CK_ComunicacaoEnvios_Categoria')
    ALTER TABLE dbo.ComunicacaoEnvios ADD CONSTRAINT CK_ComunicacaoEnvios_Categoria CHECK (Categoria IN (N'CONVOCACAO', N'EVENTOS', N'DEVOCIONAL', N'FINANCEIRO', N'CRISE'));
GO

-- A entrega de e-mail do aviso de crise que NÃO sai porque a pessoa já foi alcançada (leu no sininho, deu ciência ou recebeu no celular): situação ALCANCADO (revisão
-- independente, 23/10/2026 — a cota de 100 e-mails por hora fica para quem ainda não sabe e para a convocação oficial).
IF EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = N'CK_ComunicacaoEntregas_Situacao' AND definition NOT LIKE N'%ALCANCADO%')
    ALTER TABLE dbo.ComunicacaoEntregas DROP CONSTRAINT CK_ComunicacaoEntregas_Situacao;
IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = N'CK_ComunicacaoEntregas_Situacao')
    ALTER TABLE dbo.ComunicacaoEntregas ADD CONSTRAINT CK_ComunicacaoEntregas_Situacao CHECK (Situacao IN (N'PENDENTE', N'ENVIANDO', N'ACEITO', N'FALHOU', N'SEM_CONSENTIMENTO',
        N'SEM_CONTATO', N'SEM_APARELHO', N'CANCELADO', N'ALCANCADO'));
GO

-- ---- 9) Permissões, prazos, avisos e retenção ----

-- A lista de permissões de um papel é uma string separada por vírgula (NVARCHAR(1000) desde a 142). Se o acréscimo das duas permissões novas não couber num papel que
-- as recebe, a coluna é alargada para 2000 ANTES do UPDATE (o UPDATE que estoura derrubaria a migração e o deploy); se nem 2000 couber, a migração para com a explicação.
-- (Revisão independente, 23/10/2026.) Não há índice sobre Permissoes.
IF EXISTS (SELECT 1 FROM dbo.Papeis p CROSS APPLY (SELECT LEN(ISNULL(p.Permissoes, N''))
             + CASE WHEN p.Nome IN (N'Presidente', N'Secretário Geral') AND CHARINDEX(N',crise_gestao,', N',' + ISNULL(p.Permissoes, N'') + N',') = 0 THEN 13 ELSE 0 END
             + CASE WHEN CHARINDEX(N',seguranca_congregacao,', N',' + ISNULL(p.Permissoes, N'') + N',') = 0 THEN 22 ELSE 0 END AS Precisa) x
           WHERE p.Nome IN (N'Presidente', N'Secretário Geral', N'Dirigente de Congregação', N'Pastor de Área')
             AND x.Precisa > (SELECT CHARACTER_MAXIMUM_LENGTH FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = 'dbo' AND TABLE_NAME = 'Papeis' AND COLUMN_NAME = 'Permissoes'))
   AND (SELECT CHARACTER_MAXIMUM_LENGTH FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = 'dbo' AND TABLE_NAME = 'Papeis' AND COLUMN_NAME = 'Permissoes') BETWEEN 1 AND 1999
    ALTER TABLE dbo.Papeis ALTER COLUMN Permissoes NVARCHAR(2000) NULL;
GO
IF EXISTS (SELECT 1 FROM dbo.Papeis p CROSS APPLY (SELECT LEN(ISNULL(p.Permissoes, N''))
             + CASE WHEN p.Nome IN (N'Presidente', N'Secretário Geral') AND CHARINDEX(N',crise_gestao,', N',' + ISNULL(p.Permissoes, N'') + N',') = 0 THEN 13 ELSE 0 END
             + CASE WHEN CHARINDEX(N',seguranca_congregacao,', N',' + ISNULL(p.Permissoes, N'') + N',') = 0 THEN 22 ELSE 0 END AS Precisa) x
           WHERE p.Nome IN (N'Presidente', N'Secretário Geral', N'Dirigente de Congregação', N'Pastor de Área')
             AND x.Precisa > (SELECT CHARACTER_MAXIMUM_LENGTH FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = 'dbo' AND TABLE_NAME = 'Papeis' AND COLUMN_NAME = 'Permissoes'))
    RAISERROR(N'Migração 152: a lista de permissões de um papel não cabe em Papeis.Permissoes nem com 2000 caracteres. Revise as permissões repetidas do papel antes de aplicar.', 16, 1);
GO

IF NOT EXISTS (SELECT 1 FROM dbo.Funcionalidades WHERE Chave = 'crise_gestao')
    INSERT INTO dbo.Funcionalidades (Chave, Nome) VALUES ('crise_gestao', N'Crise — regime de crise, porta-voz único, manifestações e imprensa');
IF NOT EXISTS (SELECT 1 FROM dbo.Funcionalidades WHERE Chave = 'seguranca_congregacao')
    INSERT INTO dbo.Funcionalidades (Chave, Nome) VALUES ('seguranca_congregacao', N'Segurança da congregação — plano de emergência, simulados, vistoria e equipe');
GO
UPDATE dbo.Papeis
SET Permissoes = CASE WHEN ISNULL(Permissoes, '') = '' THEN 'crise_gestao' ELSE Permissoes + ',crise_gestao' END
WHERE Nome IN (N'Presidente', N'Secretário Geral') AND (',' + ISNULL(Permissoes, '') + ',') NOT LIKE '%,crise_gestao,%';
UPDATE dbo.Papeis
SET Permissoes = CASE WHEN ISNULL(Permissoes, '') = '' THEN 'seguranca_congregacao' ELSE Permissoes + ',seguranca_congregacao' END
WHERE Nome IN (N'Presidente', N'Secretário Geral', N'Dirigente de Congregação', N'Pastor de Área') AND (',' + ISNULL(Permissoes, '') + ',') NOT LIKE '%,seguranca_congregacao,%';
GO

IF NOT EXISTS (SELECT 1 FROM dbo.Prazos WHERE Sigla = 'SEGURANCA_PLANO_REVISAO_DIAS')
    INSERT INTO dbo.Prazos (Sigla, Nome, Dias) VALUES ('SEGURANCA_PLANO_REVISAO_DIAS', N'Segurança — revisão do plano de emergência da congregação (anual)', 365);
IF NOT EXISTS (SELECT 1 FROM dbo.Prazos WHERE Sigla = 'SEGURANCA_SIMULADO_MAX_DIAS')
    INSERT INTO dbo.Prazos (Sigla, Nome, Dias) VALUES ('SEGURANCA_SIMULADO_MAX_DIAS', N'Segurança — tempo máximo sem simulado na congregação', 365);
IF NOT EXISTS (SELECT 1 FROM dbo.Prazos WHERE Sigla = 'SEGURANCA_VISTORIA_MAX_DIAS')
    INSERT INTO dbo.Prazos (Sigla, Nome, Dias) VALUES ('SEGURANCA_VISTORIA_MAX_DIAS', N'Segurança — tempo máximo sem vistoria predial (6 meses)', 180);
-- o aviso de crise tem teto PRÓPRIO de e-mails por hora (menor que o dos comunicados), e nunca leva mais da metade da rodada quando há convocação oficial na fila
IF NOT EXISTS (SELECT 1 FROM dbo.Prazos WHERE Sigla = 'COMUNICACAO_CRISE_EMAILS_POR_HORA')
    INSERT INTO dbo.Prazos (Sigla, Nome, Dias) VALUES ('COMUNICACAO_CRISE_EMAILS_POR_HORA', N'Comunicação — teto de e-mails do aviso de crise por hora (dentro do teto dos comunicados)', 30);
GO

-- Os avisos da segurança vão ao sininho do Dirigente e do Pastor de Área (um por regra, por pessoa, juntando as congregações). Sem e-mail e sem celular de partida: num
-- mês com muitas congregações atrasadas, o e-mail direto do motor passaria dos 100 por hora do Azure (o nível geral pode ligar os canais em Permissões → Avisos).
-- O aviso da CRISE não é regra daqui: é um comunicado do sistema (categoria CRISE, regra COMUNICADO, obrigatória), com o celular e o e-mail pela fila da v7.12.
-- O pedido da imprensa que um líder registra chega na hora ao nível geral da crise e ao porta-voz (sininho e celular; obrigatório: é o encaminhamento do § 2º).
IF NOT EXISTS (SELECT 1 FROM dbo.NotificacaoRegras WHERE Chave = N'CRISE_DEMANDA_IMPRENSA')
    INSERT INTO dbo.NotificacaoRegras (Chave, Titulo, Categoria, PermissaoAlvo, NivelAlvo, CanalEmail, CanalPush, Obrigatoria)
    VALUES (N'CRISE_DEMANDA_IMPRENSA', N'Pedido da imprensa encaminhado', N'CRISE', NULL, NULL, 0, 1, 1);
-- Quando outra pessoa do nível geral abre, troca o porta-voz ou encerra o regime EM NOME do Presidente, ele recebe na hora (sininho e celular).
IF NOT EXISTS (SELECT 1 FROM dbo.NotificacaoRegras WHERE Chave = N'CRISE_EM_SEU_NOME')
    INSERT INTO dbo.NotificacaoRegras (Chave, Titulo, Categoria, PermissaoAlvo, NivelAlvo, CanalEmail, CanalPush, Obrigatoria)
    VALUES (N'CRISE_EM_SEU_NOME', N'Ato do regime de crise em seu nome', N'CRISE', NULL, NULL, 0, 1, 1);
IF NOT EXISTS (SELECT 1 FROM dbo.NotificacaoRegras WHERE Chave = N'SEGURANCA_PLANO_REVISAO')
    INSERT INTO dbo.NotificacaoRegras (Chave, Titulo, Categoria, PermissaoAlvo, NivelAlvo, CanalEmail, CanalPush, Obrigatoria)
    VALUES (N'SEGURANCA_PLANO_REVISAO', N'Plano de emergência sem revisão', N'SEGURANCA', NULL, NULL, 0, 0, 0);
IF NOT EXISTS (SELECT 1 FROM dbo.NotificacaoRegras WHERE Chave = N'SEGURANCA_SEM_SIMULADO')
    INSERT INTO dbo.NotificacaoRegras (Chave, Titulo, Categoria, PermissaoAlvo, NivelAlvo, CanalEmail, CanalPush, Obrigatoria)
    VALUES (N'SEGURANCA_SEM_SIMULADO', N'Congregação há mais de 1 ano sem simulado', N'SEGURANCA', NULL, NULL, 0, 0, 0);
IF NOT EXISTS (SELECT 1 FROM dbo.NotificacaoRegras WHERE Chave = N'SEGURANCA_SEM_VISTORIA')
    INSERT INTO dbo.NotificacaoRegras (Chave, Titulo, Categoria, PermissaoAlvo, NivelAlvo, CanalEmail, CanalPush, Obrigatoria)
    VALUES (N'SEGURANCA_SEM_VISTORIA', N'Vistoria predial atrasada (mais de 6 meses)', N'SEGURANCA', NULL, NULL, 0, 0, 0);
IF NOT EXISTS (SELECT 1 FROM dbo.NotificacaoRegras WHERE Chave = N'SEGURANCA_AVCB_SEGURO')
    INSERT INTO dbo.NotificacaoRegras (Chave, Titulo, Categoria, PermissaoAlvo, NivelAlvo, CanalEmail, CanalPush, Obrigatoria)
    VALUES (N'SEGURANCA_AVCB_SEGURO', N'AVCB ou seguro do templo vencido', N'SEGURANCA', NULL, NULL, 0, 0, 0);
GO

IF NOT EXISTS (SELECT 1 FROM dbo.PoliticasRetencao WHERE Categoria = N'Crise — regime, porta-voz, manifestações e imprensa')
    INSERT INTO dbo.PoliticasRetencao (Categoria, BaseLegal, DiasRetencao) VALUES (N'Crise — regime, porta-voz, manifestações e imprensa', N'x', NULL);
IF NOT EXISTS (SELECT 1 FROM dbo.PoliticasRetencao WHERE Categoria = N'Crise — contato do jornalista na demanda de imprensa')
    INSERT INTO dbo.PoliticasRetencao (Categoria, BaseLegal, DiasRetencao) VALUES (N'Crise — contato do jornalista na demanda de imprensa', N'x', 1825);
IF NOT EXISTS (SELECT 1 FROM dbo.PoliticasRetencao WHERE Categoria = N'Segurança — equipe de segurança após a saída')
    INSERT INTO dbo.PoliticasRetencao (Categoria, BaseLegal, DiasRetencao) VALUES (N'Segurança — equipe de segurança após a saída', N'x', 1825);
GO
UPDATE dbo.PoliticasRetencao
SET BaseLegal = N'Regimento Art. 161-B; LGPD art. 7º, VI e IX: o histórico da crise (quem ordenou, o porta-voz, o que foi dito e com autorização de quem, os pedidos da imprensa e as respostas) é a prova do que a Igreja disse e fica sem prazo.'
WHERE Categoria = N'Crise — regime, porta-voz, manifestações e imprensa' AND BaseLegal = N'x';
UPDATE dbo.PoliticasRetencao
SET BaseLegal = N'LGPD art. 7º, IX: o telefone ou e-mail de quem pediu pela imprensa serve para responder; 5 anos depois de recebida a demanda o contato é apagado (o veículo, o pedido e a resposta ficam).'
WHERE Categoria = N'Crise — contato do jornalista na demanda de imprensa' AND BaseLegal = N'x';
UPDATE dbo.PoliticasRetencao
SET BaseLegal = N'LGPD art. 7º, IX: quem serviu na equipe de segurança da congregação (função, desde e até); 5 anos depois de sair da equipe o nome sai do registro, e a exclusão LGPD o tira na hora.'
WHERE Categoria = N'Segurança — equipe de segurança após a saída' AND BaseLegal = N'x';
GO
