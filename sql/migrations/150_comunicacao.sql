-- ============================================================
-- Migração 150 — v7.12: Comunicação — consentimento por canal e categoria, modelos aprovados, envio por grupo e registro de entrega
-- (decisões do responsável da Igreja, 22/10/2026: sem WhatsApp e sem SMS nesta versão — os canais ficam previstos no banco; nenhum grupo pelo dízimo)
--
--   1) ComunicacaoConsentimentos: o histórico do "sim" e do "não" de cada membro, por canal (e-mail, celular; WhatsApp e SMS previstos) e por categoria (eventos, devocional,
--      financeiro), com a versão e a impressão digital (SHA-256) do texto aceito, a origem (Meu Painel, ficha em papel, link de saída, exclusão LGPD) e o endereço de quem
--      aceitou. Vale a linha mais recente; nada se edita. A convocação oficial não pede consentimento (obrigação estatutária) e por isso não tem linha aqui.
--   2) ComunicacaoModelos: o texto que se envia. O aprovado não se edita (corrigir = versão seguinte) e não se apaga.
--   3) ComunicacaoAudiencias: grupos guardados com nome (só os critérios; a lista de pessoas é calculada na hora de cada envio).
--   4) ComunicacaoEnvios e ComunicacaoEntregas: cada envio e, por pessoa e por canal, o que aconteceu (aceito pelo serviço, falhou, sem consentimento, sem e-mail, sem
--      aparelho, cancelado) e a ciência da convocação ("Recebi a convocação"). A leitura vem do sininho (Notificacoes, regra COMUNICADO).
--   5) a permissão comunicacao, os prazos da fila de e-mail (o serviço do Azure manda 30 por minuto e 100 por hora no domínio da Igreja), a regra COMUNICADO do sininho e a
--      retenção.
-- Apagar consentimento e entrega só com a marca de sessão 'comunicacao_purga' (exclusão LGPD e retenção), posta e retirada na mesma transação (o mesmo molde da 148).
--
-- Idempotente: seguro para reexecutar sem apagar dados.
-- ============================================================

-- ---- 1) Consentimentos ----

IF OBJECT_ID(N'dbo.ComunicacaoConsentimentos', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.ComunicacaoConsentimentos (
        ConsentimentoId         INT IDENTITY PRIMARY KEY,
        MembroId                INT NOT NULL REFERENCES dbo.MembroReferencia(MembroId),
        Canal                   NVARCHAR(10) NOT NULL CONSTRAINT CK_ComunicacaoConsentimentos_Canal CHECK (Canal IN (N'EMAIL', N'PUSH', N'WHATSAPP', N'SMS')),
        Categoria               NVARCHAR(12) NOT NULL CONSTRAINT CK_ComunicacaoConsentimentos_Categoria CHECK (Categoria IN (N'EVENTOS', N'DEVOCIONAL', N'FINANCEIRO')),
        Concedido               BIT NOT NULL,
        Origem                  NVARCHAR(14) NOT NULL CONSTRAINT CK_ComunicacaoConsentimentos_Origem CHECK (Origem IN (N'MEU_PAINEL', N'FICHA_PAPEL', N'LINK_SAIR', N'EXCLUSAO_LGPD')),
        TextoVersao             NVARCHAR(20) NOT NULL,
        TextoHash               CHAR(64) NOT NULL,
        DataFicha               DATE NULL,
        EnderecoIp              NVARCHAR(64) NULL,
        RegistradoPorMembroId   INT NULL REFERENCES dbo.MembroReferencia(MembroId),
        EnvioId                 INT NULL,
        CriadoEm                DATETIME2 NOT NULL CONSTRAINT DF_ComunicacaoConsentimentos_CriadoEm DEFAULT SYSUTCDATETIME(),
        -- o "sim" só nasce de quem leu o texto (o próprio membro ou a ficha que ele assinou); a ficha em papel diz a data e quem a lançou
        CONSTRAINT CK_ComunicacaoConsentimentos_Sim CHECK (Concedido = 0 OR Origem IN (N'MEU_PAINEL', N'FICHA_PAPEL')),
        CONSTRAINT CK_ComunicacaoConsentimentos_Ficha CHECK (Origem <> N'FICHA_PAPEL' OR (DataFicha IS NOT NULL AND RegistradoPorMembroId IS NOT NULL)),
        CONSTRAINT CK_ComunicacaoConsentimentos_Hash CHECK (LEN(TextoHash) = 64)
    );
END
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_ComunicacaoConsentimentos_Vigente' AND object_id = OBJECT_ID(N'dbo.ComunicacaoConsentimentos'))
    CREATE INDEX IX_ComunicacaoConsentimentos_Vigente ON dbo.ComunicacaoConsentimentos (MembroId, Canal, Categoria, ConsentimentoId DESC) INCLUDE (Concedido);
GO
EXEC(N'CREATE OR ALTER TRIGGER dbo.TR_ComunicacaoConsentimentos_Imutavel ON dbo.ComunicacaoConsentimentos AFTER UPDATE, DELETE AS
BEGIN
    SET NOCOUNT ON;
    IF EXISTS (SELECT 1 FROM inserted)
    BEGIN
        RAISERROR(N''O consentimento não se edita: cada mudança é uma linha nova.'', 16, 1);
        ROLLBACK TRANSACTION;
        RETURN;
    END
    IF EXISTS (SELECT 1 FROM deleted) AND ISNULL(CAST(SESSION_CONTEXT(N''comunicacao_purga'') AS INT), 0) <> 1
    BEGIN
        RAISERROR(N''O histórico de consentimento só sai pela exclusão LGPD.'', 16, 1);
        ROLLBACK TRANSACTION;
    END
END');
GO

-- ---- 2) Modelos ----

IF OBJECT_ID(N'dbo.ComunicacaoModelos', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.ComunicacaoModelos (
        ModeloId                INT IDENTITY PRIMARY KEY,
        Chave                   NVARCHAR(40) NOT NULL,
        Versao                  INT NOT NULL CONSTRAINT CK_ComunicacaoModelos_Versao CHECK (Versao >= 1),
        Categoria               NVARCHAR(12) NOT NULL CONSTRAINT CK_ComunicacaoModelos_Categoria CHECK (Categoria IN (N'CONVOCACAO', N'EVENTOS', N'DEVOCIONAL', N'FINANCEIRO')),
        Titulo                  NVARCHAR(150) NOT NULL,
        Corpo                   NVARCHAR(2000) NOT NULL,
        Status                  NVARCHAR(10) NOT NULL CONSTRAINT DF_ComunicacaoModelos_Status DEFAULT N'RASCUNHO'
                                    CONSTRAINT CK_ComunicacaoModelos_Status CHECK (Status IN (N'RASCUNHO', N'APROVADO', N'ARQUIVADO')),
        CriadoPorMembroId       INT NOT NULL REFERENCES dbo.MembroReferencia(MembroId),
        CriadoEm                DATETIME2 NOT NULL CONSTRAINT DF_ComunicacaoModelos_CriadoEm DEFAULT SYSUTCDATETIME(),
        AprovadoPorMembroId     INT NULL REFERENCES dbo.MembroReferencia(MembroId),
        AprovadoEm              DATETIME2 NULL,
        ArquivadoEm             DATETIME2 NULL,
        CONSTRAINT UQ_ComunicacaoModelos_ChaveVersao UNIQUE (Chave, Versao),
        CONSTRAINT CK_ComunicacaoModelos_Aprovacao CHECK ((Status = N'RASCUNHO' AND AprovadoEm IS NULL) OR (Status <> N'RASCUNHO' AND AprovadoEm IS NOT NULL AND AprovadoPorMembroId IS NOT NULL)),
        CONSTRAINT CK_ComunicacaoModelos_Arquivo CHECK ((Status = N'ARQUIVADO' AND ArquivadoEm IS NOT NULL) OR (Status <> N'ARQUIVADO' AND ArquivadoEm IS NULL))
    );
END
GO
EXEC(N'CREATE OR ALTER TRIGGER dbo.TR_ComunicacaoModelos_Aprovado ON dbo.ComunicacaoModelos AFTER UPDATE, DELETE AS
BEGIN
    SET NOCOUNT ON;
    IF NOT EXISTS (SELECT 1 FROM inserted)
    BEGIN
        IF EXISTS (SELECT 1 FROM deleted WHERE Status <> N''RASCUNHO'')
        BEGIN
            RAISERROR(N''O modelo aprovado não se apaga (pode ser arquivado).'', 16, 1);
            ROLLBACK TRANSACTION;
        END
        RETURN;
    END
    IF EXISTS (SELECT 1 FROM inserted i JOIN deleted d ON d.ModeloId = i.ModeloId
        WHERE i.Chave <> d.Chave OR i.Versao <> d.Versao OR i.CriadoPorMembroId <> d.CriadoPorMembroId OR i.CriadoEm <> d.CriadoEm
           OR (d.Status <> N''RASCUNHO'' AND (i.Titulo <> d.Titulo OR i.Corpo <> d.Corpo OR i.Categoria <> d.Categoria OR i.AprovadoEm <> d.AprovadoEm OR i.AprovadoPorMembroId <> d.AprovadoPorMembroId))
           OR (d.Status = N''APROVADO'' AND i.Status NOT IN (N''APROVADO'', N''ARQUIVADO''))
           OR (d.Status = N''ARQUIVADO'' AND i.Status <> N''ARQUIVADO''))
    BEGIN
        RAISERROR(N''O modelo aprovado não se edita: crie a versão seguinte.'', 16, 1);
        ROLLBACK TRANSACTION;
    END
END');
GO

-- ---- 3) Grupos guardados ----

IF OBJECT_ID(N'dbo.ComunicacaoAudiencias', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.ComunicacaoAudiencias (
        AudienciaId             INT IDENTITY PRIMARY KEY,
        Nome                    NVARCHAR(100) NOT NULL,
        CriteriosJson           NVARCHAR(2000) NOT NULL CONSTRAINT CK_ComunicacaoAudiencias_Json CHECK (ISJSON(CriteriosJson) = 1),
        CriadoPorMembroId       INT NOT NULL REFERENCES dbo.MembroReferencia(MembroId),
        CriadoEm                DATETIME2 NOT NULL CONSTRAINT DF_ComunicacaoAudiencias_CriadoEm DEFAULT SYSUTCDATETIME(),
        Ativa                   BIT NOT NULL CONSTRAINT DF_ComunicacaoAudiencias_Ativa DEFAULT 1
    );
END
GO

-- ---- 4) Envios e entregas ----

IF OBJECT_ID(N'dbo.ComunicacaoEnvios', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.ComunicacaoEnvios (
        EnvioId                 INT IDENTITY PRIMARY KEY,
        ModeloId                INT NOT NULL REFERENCES dbo.ComunicacaoModelos(ModeloId),
        Categoria               NVARCHAR(12) NOT NULL CONSTRAINT CK_ComunicacaoEnvios_Categoria CHECK (Categoria IN (N'CONVOCACAO', N'EVENTOS', N'DEVOCIONAL', N'FINANCEIRO')),
        CriteriosJson           NVARCHAR(2000) NOT NULL CONSTRAINT CK_ComunicacaoEnvios_Json CHECK (ISJSON(CriteriosJson) = 1),
        GrupoDescricao          NVARCHAR(500) NOT NULL,
        EnviadoPorMembroId      INT NOT NULL REFERENCES dbo.MembroReferencia(MembroId),
        CriadoEm                DATETIME2 NOT NULL CONSTRAINT DF_ComunicacaoEnvios_CriadoEm DEFAULT SYSUTCDATETIME(),
        Total                   INT NOT NULL CONSTRAINT CK_ComunicacaoEnvios_Total CHECK (Total >= 0),
        Status                  NVARCHAR(10) NOT NULL CONSTRAINT DF_ComunicacaoEnvios_Status DEFAULT N'FILA'
                                    CONSTRAINT CK_ComunicacaoEnvios_Status CHECK (Status IN (N'FILA', N'CONCLUIDO', N'CANCELADO')),
        ConcluidoEm             DATETIME2 NULL,
        CanceladoPorMembroId    INT NULL REFERENCES dbo.MembroReferencia(MembroId),
        CONSTRAINT CK_ComunicacaoEnvios_Fim CHECK ((Status = N'FILA' AND ConcluidoEm IS NULL) OR (Status <> N'FILA' AND ConcluidoEm IS NOT NULL)),
        CONSTRAINT CK_ComunicacaoEnvios_Cancelado CHECK ((Status = N'CANCELADO' AND CanceladoPorMembroId IS NOT NULL) OR (Status <> N'CANCELADO' AND CanceladoPorMembroId IS NULL))
    );
END
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_ComunicacaoEnvios_Fila' AND object_id = OBJECT_ID(N'dbo.ComunicacaoEnvios'))
    CREATE INDEX IX_ComunicacaoEnvios_Fila ON dbo.ComunicacaoEnvios (Status, EnvioId);
GO
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_ComunicacaoConsentimentos_Envio')
    ALTER TABLE dbo.ComunicacaoConsentimentos ADD CONSTRAINT FK_ComunicacaoConsentimentos_Envio FOREIGN KEY (EnvioId) REFERENCES dbo.ComunicacaoEnvios(EnvioId);
GO

IF OBJECT_ID(N'dbo.ComunicacaoEntregas', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.ComunicacaoEntregas (
        EntregaId               INT IDENTITY PRIMARY KEY,
        EnvioId                 INT NOT NULL REFERENCES dbo.ComunicacaoEnvios(EnvioId),
        MembroId                INT NULL REFERENCES dbo.MembroReferencia(MembroId),
        Canal                   NVARCHAR(10) NOT NULL CONSTRAINT CK_ComunicacaoEntregas_Canal CHECK (Canal IN (N'SININHO', N'EMAIL', N'PUSH', N'WHATSAPP', N'SMS')),
        Situacao                NVARCHAR(18) NOT NULL CONSTRAINT CK_ComunicacaoEntregas_Situacao CHECK (Situacao IN (N'PENDENTE', N'ENVIANDO', N'ACEITO', N'FALHOU', N'SEM_CONSENTIMENTO',
                                    N'SEM_CONTATO', N'SEM_APARELHO', N'CANCELADO')),
        AtualizadoEm            DATETIME2 NOT NULL CONSTRAINT DF_ComunicacaoEntregas_AtualizadoEm DEFAULT SYSUTCDATETIME(),
        CienciaEm               DATETIME2 NULL,
        AnonimizadoEm           DATETIME2 NULL,
        CONSTRAINT CK_ComunicacaoEntregas_Ciencia CHECK (CienciaEm IS NULL OR Canal = N'SININHO'),
        CONSTRAINT CK_ComunicacaoEntregas_Anonimo CHECK (MembroId IS NOT NULL OR AnonimizadoEm IS NOT NULL)
    );
END
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UX_ComunicacaoEntregas_Pessoa' AND object_id = OBJECT_ID(N'dbo.ComunicacaoEntregas'))
    CREATE UNIQUE INDEX UX_ComunicacaoEntregas_Pessoa ON dbo.ComunicacaoEntregas (EnvioId, MembroId, Canal) WHERE MembroId IS NOT NULL;
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_ComunicacaoEntregas_Fila' AND object_id = OBJECT_ID(N'dbo.ComunicacaoEntregas'))
    CREATE INDEX IX_ComunicacaoEntregas_Fila ON dbo.ComunicacaoEntregas (Canal, Situacao, EntregaId) INCLUDE (EnvioId, MembroId);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_ComunicacaoEntregas_Membro' AND object_id = OBJECT_ID(N'dbo.ComunicacaoEntregas'))
    CREATE INDEX IX_ComunicacaoEntregas_Membro ON dbo.ComunicacaoEntregas (MembroId, EnvioId) WHERE MembroId IS NOT NULL;
GO
-- A entrega anda para a frente: o envio, a pessoa e o canal não mudam (a pessoa só sai na anonimização), a situação final não muda mais, a ciência não se desfaz.
-- (ENVIANDO volta a PENDENTE só quando o serviço de e-mail recusou por excesso: nada saiu.)
-- Apagar só com a marca 'comunicacao_purga'.
EXEC(N'CREATE OR ALTER TRIGGER dbo.TR_ComunicacaoEntregas_Protegida ON dbo.ComunicacaoEntregas AFTER UPDATE, DELETE AS
BEGIN
    SET NOCOUNT ON;
    IF NOT EXISTS (SELECT 1 FROM inserted)
    BEGIN
        IF EXISTS (SELECT 1 FROM deleted) AND ISNULL(CAST(SESSION_CONTEXT(N''comunicacao_purga'') AS INT), 0) <> 1
        BEGIN
            RAISERROR(N''O registro de entrega não se apaga.'', 16, 1);
            ROLLBACK TRANSACTION;
        END
        RETURN;
    END
    IF EXISTS (SELECT 1 FROM inserted i JOIN deleted d ON d.EntregaId = i.EntregaId
        WHERE i.EnvioId <> d.EnvioId OR i.Canal <> d.Canal
           OR (ISNULL(i.MembroId, -1) <> ISNULL(d.MembroId, -1) AND NOT (i.MembroId IS NULL AND i.AnonimizadoEm IS NOT NULL))
           OR (d.AnonimizadoEm IS NOT NULL AND ISNULL(i.AnonimizadoEm, ''19000101'') <> d.AnonimizadoEm)
           OR (d.CienciaEm IS NOT NULL AND ISNULL(i.CienciaEm, ''19000101'') <> d.CienciaEm)
           OR (d.Situacao NOT IN (N''PENDENTE'', N''ENVIANDO'') AND i.Situacao <> d.Situacao))
    BEGIN
        RAISERROR(N''O registro de entrega só anda para a frente.'', 16, 1);
        ROLLBACK TRANSACTION;
    END
END');
GO

-- ---- 5) Permissão, prazos, a regra do sininho e a retenção ----

IF NOT EXISTS (SELECT 1 FROM dbo.Funcionalidades WHERE Chave = 'comunicacao')
    INSERT INTO dbo.Funcionalidades (Chave, Nome) VALUES ('comunicacao', N'Comunicação — comunicados a grupos de membros');
UPDATE dbo.Papeis
SET Permissoes = CASE WHEN ISNULL(Permissoes, '') = '' THEN 'comunicacao' ELSE Permissoes + ',comunicacao' END
WHERE Nome IN (N'Presidente', N'Secretário Geral', N'Dirigente de Congregação', N'Pastor de Área') AND (',' + ISNULL(Permissoes, '') + ',') NOT LIKE '%,comunicacao,%';
GO

IF NOT EXISTS (SELECT 1 FROM dbo.Prazos WHERE Sigla = 'COMUNICACAO_EMAILS_POR_RODADA')
    INSERT INTO dbo.Prazos (Sigla, Nome, Dias) VALUES ('COMUNICACAO_EMAILS_POR_RODADA', N'Comunicação — e-mails por rodada da fila (a cada 15 min; o Azure aceita 30/min)', 20);
IF NOT EXISTS (SELECT 1 FROM dbo.Prazos WHERE Sigla = 'COMUNICACAO_EMAILS_POR_HORA')
    INSERT INTO dbo.Prazos (Sigla, Nome, Dias) VALUES ('COMUNICACAO_EMAILS_POR_HORA', N'Comunicação — teto de e-mails de comunicado por hora (o Azure aceita 100/h)', 80);
GO

IF NOT EXISTS (SELECT 1 FROM dbo.NotificacaoRegras WHERE Chave = N'COMUNICADO')
    INSERT INTO dbo.NotificacaoRegras (Chave, Titulo, Categoria, PermissaoAlvo, NivelAlvo, CanalEmail, CanalPush, Obrigatoria)
    VALUES (N'COMUNICADO', N'Comunicado da Igreja', N'COMUNICACAO', NULL, NULL, 0, 0, 1);
GO

IF NOT EXISTS (SELECT 1 FROM dbo.PoliticasRetencao WHERE Categoria = N'Comunicação — registro de entrega')
    INSERT INTO dbo.PoliticasRetencao (Categoria, BaseLegal, DiasRetencao) VALUES (N'Comunicação — registro de entrega', N'x', 365);
IF NOT EXISTS (SELECT 1 FROM dbo.PoliticasRetencao WHERE Categoria = N'Comunicação — registro de entrega da convocação oficial')
    INSERT INTO dbo.PoliticasRetencao (Categoria, BaseLegal, DiasRetencao) VALUES (N'Comunicação — registro de entrega da convocação oficial', N'x', 1825);
GO
UPDATE dbo.PoliticasRetencao
SET BaseLegal = N'Comunicados aos membros (LGPD arts. 7º, I e IX, e 11, II, a): quem recebeu, por qual canal e se leu; depois de 1 ano o registro perde o nome (a contagem do envio fica). O histórico de consentimento fica enquanto a pessoa estiver no cadastro e sai na exclusão LGPD.'
WHERE Categoria = N'Comunicação — registro de entrega';
UPDATE dbo.PoliticasRetencao
SET BaseLegal = N'Convocação oficial (Estatuto: a convocação regular é condição de validade da assembleia): quem foi alcançado e quem deu ciência fica 5 anos como prova do ato; depois perde o nome.'
WHERE Categoria = N'Comunicação — registro de entrega da convocação oficial';
GO
